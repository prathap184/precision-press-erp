'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  Loader2, 
  ArrowLeft, 
  Activity, 
  Clock, 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Printer, 
  Palette, 
  Truck, 
  IndianRupee, 
  ShieldCheck, 
  FileText, 
  ExternalLink,
  Package,
  Layers,
  Search,
  Filter,
  User,
  Calendar
} from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';

interface TimelineItem {
  id: string;
  timestamp: string;
  source: 'activity_log' | 'workflow_step' | 'stage_history' | 'timeline_event' | 'child_item';
  actorName: string;
  actorRole: string;
  actorId?: string;
  action: string;
  description: string;
  stage?: string;
  status?: string;
  itemRef?: string;
  proofUrl?: string;
  filePath?: string;
  meta?: Record<string, any>;
}

export default function OrderLedgerPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [childOrders, setChildOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [stageHistory, setStageHistory] = useState<any[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, { name: string; role?: string }>>({});
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (!orderId) return;

    let mounted = true;
    const fetchFullLedger = async () => {
      setLoading(true);
      try {
        // 1. Fetch main order
        const { data: orderData } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();
        
        if (orderData && mounted) {
          setOrder(orderData);
        }

        // 2. Fetch child orders (if any with parent_order_id or id starting with prefix)
        const { data: childOrdersData } = await supabase
          .from('orders')
          .select('*')
          .or(`parent_order_id.eq.${orderId},id.ilike.${orderId}-%`);

        if (childOrdersData && mounted) {
          setChildOrders(childOrdersData.filter(c => c.id !== orderId));
        }

        // 3. Fetch order items
        const { data: itemsData } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);

        if (itemsData && mounted) {
          setItems(itemsData);
        }

        // 4. Fetch activity logs (matching orderId or parentOrderId or child order ids)
        const childIds = (childOrdersData || []).map(c => c.id);
        const allTargetIds = [orderId, ...childIds];
        
        const { data: logsList } = await supabase
          .from('activity_logs')
          .select('*')
          .order('timestamp', { ascending: false });

        if (logsList && mounted) {
          const filteredLogs = logsList.filter((log: any) => {
            const metaOrderId = log.meta?.orderId || log.meta?.parentOrderId || log.meta?.order_id || log.entity_id;
            return allTargetIds.some(id => metaOrderId === id || (metaOrderId && typeof metaOrderId === 'string' && metaOrderId.includes(orderId)));
          });
          setLogs(filteredLogs);
        }

        // 5. Fetch workflow stage history
        const { data: historyList } = await supabase
          .from('workflow_stage_history')
          .select('*')
          .or(`parent_order_id.eq.${orderId},order_id.eq.${orderId}`)
          .order('entered_at', { ascending: true });

        if (historyList && mounted) {
          setStageHistory(historyList);
        }

        // 6. Fetch profiles to map staff names
        const { data: profileList } = await supabase
          .from('profiles')
          .select('id, uid, name, displayName, role');
          
        if (profileList && mounted) {
          const sMap: Record<string, { name: string; role?: string }> = {};
          profileList.forEach((p: any) => {
            const userId = p.uid || p.id;
            sMap[userId] = {
              name: p.displayName || p.name || 'Staff User',
              role: p.role,
            };
          });
          setStaffMap(sMap);
        }
      } catch (err) {
        console.error('Failed to fetch comprehensive ledger:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchFullLedger();

    return () => {
      mounted = false;
    };
  }, [orderId]);

  // Format Helper
  const formatLogDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(new Date(dateStr));
    } catch {
      return String(dateStr);
    }
  };

  // Compile Unified Timeline
  const timelineEvents: TimelineItem[] = useMemo(() => {
    if (!order) return [];

    const list: TimelineItem[] = [];

    // Resolve Proxy Staff Name & Role (e.g. PRATHAP)
    let proxyStaffName = '';
    let proxyStaffRole = 'ADMIN';
    if (order.proxyExecutor) {
      try {
        const proxy = typeof order.proxyExecutor === 'string' ? JSON.parse(order.proxyExecutor) : order.proxyExecutor;
        proxyStaffName = order.proxyName || proxy?.name || proxy?.displayName || '';
        proxyStaffRole = proxy?.role || 'STAFF_PROXY';
      } catch (e) {
        proxyStaffName = order.proxyName || '';
      }
    }
    if (!proxyStaffName && order.createdBy && staffMap[order.createdBy]) {
      proxyStaffName = staffMap[order.createdBy].name;
      proxyStaffRole = staffMap[order.createdBy].role || 'STAFF';
    }

    const getActorInfo = (uidOrRole: string | undefined, defaultRole = 'SYSTEM') => {
      if (!uidOrRole) return { name: defaultRole, role: defaultRole };
      if (uidOrRole === 'STAFF_PROXY' || uidOrRole === 'PROXY' || String(uidOrRole).toUpperCase().includes('STAFF_PROXY')) {
        return { 
          name: proxyStaffName || 'Staff Proxy', 
          role: proxyStaffRole || 'STAFF_PROXY' 
        };
      }
      if (staffMap[uidOrRole]) {
        return { 
          name: staffMap[uidOrRole].name, 
          role: staffMap[uidOrRole].role || defaultRole 
        };
      }
      return { name: uidOrRole, role: defaultRole };
    };

    // 1. Order Creation Event
    if (order.createdAt) {
      let creatorName = order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Customer';
      let creatorRole = 'CUSTOMER';
      if (order.proxyExecutor || proxyStaffName) {
        creatorName = `${proxyStaffName || 'Staff'} (Proxy for ${creatorName})`;
        creatorRole = proxyStaffRole || 'STAFF_PROXY';
      }

      list.push({
        id: `created-${order.id}`,
        timestamp: typeof order.createdAt === 'object' && order.createdAt?.seconds 
          ? new Date(order.createdAt.seconds * 1000).toISOString() 
          : new Date(order.createdAt).toISOString(),
        source: 'timeline_event',
        actorName: creatorName,
        actorRole: creatorRole,
        action: 'Order Placed & Booked',
        description: `Order #${order.id.replace('ORD-', '')} was initiated for ${order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Customer'} with total ₹${order.amounts?.grandTotal?.toLocaleString('en-IN') || 0}.`,
        stage: 'INTAKE',
        status: 'INITIALIZED',
        meta: {
          itemsCount: order.items?.length || 1,
          totalAmount: order.amounts?.grandTotal,
          deliveryChoice: order.delivery?.choice || 'PICKUP',
        }
      });
    }

    // 2. Workflow Snapshot Steps (Who worked on each step)
    if (order.workflowSnapshot?.steps && Array.isArray(order.workflowSnapshot.steps)) {
      order.workflowSnapshot.steps.forEach((step: any, idx: number) => {
        if (step.status === 'COMPLETED' || step.status === 'IN_PROGRESS') {
          const actor = getActorInfo(step.completedBy, step.role);
          const time = step.completedAt || step.startedAt || step.updatedAt || order.updatedAt;
          
          list.push({
            id: `step-${idx}-${step.role}`,
            timestamp: time ? (typeof time === 'object' && time.seconds ? new Date(time.seconds * 1000).toISOString() : new Date(time).toISOString()) : new Date().toISOString(),
            source: 'workflow_step',
            actorName: actor.name,
            actorRole: actor.role === 'STAFF_PROXY' && proxyStaffRole ? proxyStaffRole : (step.role || actor.role),
            action: step.status === 'COMPLETED' ? `Completed Stage: ${step.label || step.role}` : `Stage In Progress: ${step.label || step.role}`,
            description: step.notes || `Step ${step.label || step.role} was marked as ${step.status} in workflow pipeline.`,
            stage: step.role,
            status: step.status,
            meta: step,
          });
        }
      });
    }

    // 3. Print Workflow & Timeline Events
    const printTimeline = order.workflow?.printWorkflow?.timeline || order.workflowSnapshot?.timeline || [];
    if (Array.isArray(printTimeline)) {
      printTimeline.forEach((pt: any, idx: number) => {
        const actor = getActorInfo(pt.user, pt.role || 'PRINTER');
        list.push({
          id: `print-timeline-${idx}`,
          timestamp: pt.timestamp ? new Date(pt.timestamp).toISOString() : new Date().toISOString(),
          source: 'timeline_event',
          actorName: actor.name,
          actorRole: pt.role || 'PRINTER',
          action: pt.event ? pt.event.replace(/_/g, ' ') : 'Print Workflow Action',
          description: pt.notes || 'Print action recorded.',
          stage: pt.stage || 'PRINTING',
          status: pt.status,
          meta: pt,
        });
      });
    }

    // 4. File / Proof Upload Events (Designer, Pasting, Finishing, Dispatch)
    if (order.workflow?.correctedArtworkUrl) {
      list.push({
        id: `artwork-corrected-${order.id}`,
        timestamp: order.workflow?.correctedArtworkUploadedAt || new Date().toISOString(),
        source: 'timeline_event',
        actorName: order.workflow?.correctedArtworkUploadedBy ? getActorInfo(order.workflow.correctedArtworkUploadedBy, 'DESIGNER').name : 'Designer',
        actorRole: 'DESIGNER',
        action: 'Design Artwork Finalized',
        description: 'Designer uploaded the production-ready corrected artwork.',
        stage: 'DESIGNER',
        proofUrl: order.workflow.correctedArtworkUrl,
      });
    }

    if (order.workflow?.pastingProofUrl) {
      list.push({
        id: `pasting-proof-${order.id}`,
        timestamp: order.workflow?.pastingProofUrlUploadedAt || new Date().toISOString(),
        source: 'timeline_event',
        actorName: order.workflow?.pastingProofUrlUploadedBy ? getActorInfo(order.workflow.pastingProofUrlUploadedBy, 'PASTING').name : 'Pasting Operator',
        actorRole: 'PASTING',
        action: 'Pasting Stage Proof Uploaded',
        description: 'Operator uploaded verification photo and completed pasting stage.',
        stage: 'PASTING',
        proofUrl: order.workflow.pastingProofUrl,
      });
    }

    if (order.workflow?.finishingProofUrl) {
      list.push({
        id: `finishing-proof-${order.id}`,
        timestamp: order.workflow?.finishingProofUrlUploadedAt || new Date().toISOString(),
        source: 'timeline_event',
        actorName: order.workflow?.finishingProofUrlUploadedBy ? getActorInfo(order.workflow.finishingProofUrlUploadedBy, 'FINISHING').name : 'Finishing Operator',
        actorRole: 'FINISHING',
        action: 'Finishing Stage Proof Uploaded',
        description: 'Operator verified and uploaded finishing proof photo.',
        stage: 'FINISHING',
        proofUrl: order.workflow.finishingProofUrl,
      });
    }

    if (order.workflow?.dispatchProofUrl || order.dispatchInfo?.dispatchProofUrl) {
      const pUrl = order.workflow?.dispatchProofUrl || order.dispatchInfo?.dispatchProofUrl;
      list.push({
        id: `dispatch-proof-${order.id}`,
        timestamp: order.dispatchInfo?.dispatchedAt || order.workflow?.dispatchProofUrlUploadedAt || new Date().toISOString(),
        source: 'timeline_event',
        actorName: order.dispatchInfo?.dispatchedBy ? getActorInfo(order.dispatchInfo.dispatchedBy, 'DISPATCH').name : 'Dispatch Manager',
        actorRole: 'DISPATCH',
        action: 'Order Dispatched & LR Attached',
        description: `Dispatched via ${order.dispatchInfo?.transportName || order.delivery?.choice || 'Transport'}. LR No: ${order.dispatchInfo?.lrNumber || '—'}.`,
        stage: 'DISPATCH',
        proofUrl: pUrl,
        meta: order.dispatchInfo,
      });
    }

    // 5. Activity Logs from Database
    logs.forEach((log: any, idx: number) => {
      const actor = getActorInfo(log.userId, log.userRole || 'USER');
      list.push({
        id: `act-log-${log.id || idx}`,
        timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
        source: 'activity_log',
        actorName: log.userName || actor.name,
        actorRole: log.userRole || actor.role,
        action: log.action ? log.action.replace(/_/g, ' ') : 'Activity Logged',
        description: log.meta?.remarks || log.description || log.meta?.notes || `Action executed on order by ${log.userName || actor.name}.`,
        stage: log.userRole || 'SYSTEM',
        status: log.meta?.nextStatus || log.meta?.status,
        meta: log.meta,
      });
    });

    // 6. Workflow Stage History entries
    stageHistory.forEach((sh: any, idx: number) => {
      const actor = getActorInfo(sh.updated_by, sh.workflow_stage || 'PRODUCTION');
      list.push({
        id: `stage-hist-${sh.id || idx}`,
        timestamp: sh.entered_at ? new Date(sh.entered_at).toISOString() : new Date().toISOString(),
        source: 'stage_history',
        actorName: actor.name,
        actorRole: sh.workflow_stage || actor.role,
        action: `Entered Stage: ${sh.workflow_stage}`,
        description: `Stage status: ${sh.workflow_status}. ${sh.duration_minutes ? `Duration: ${sh.duration_minutes}m` : ''}`,
        stage: sh.workflow_stage,
        status: sh.workflow_status,
        meta: sh.metadata,
      });
    });

    // 7. Child Orders / Sub-items Events
    childOrders.forEach((child: any) => {
      if (child.createdAt) {
        list.push({
          id: `child-order-${child.id}`,
          timestamp: typeof child.createdAt === 'object' && child.createdAt?.seconds 
            ? new Date(child.createdAt.seconds * 1000).toISOString() 
            : new Date(child.createdAt).toISOString(),
          source: 'child_item',
          actorName: child.printerName || child.assignedPrinterName || 'System',
          actorRole: 'CHILD_ORDER',
          action: `Child Order Assigned: ${child.id}`,
          description: `Sub-item order #${child.id} routed to ${child.printerCategory || child.assignedPrinterName || 'Production'}. Status: ${child.status}.`,
          stage: 'ROUTING',
          status: child.status,
          itemRef: child.id,
          filePath: child.tiffPath || child.workflow?.tiffPath,
        });
      }
    });

    // Deduplicate by identical action + timestamp within 5 seconds
    const seen = new Set<string>();
    const deduplicated = list.filter((item) => {
      const roundedTime = Math.floor(new Date(item.timestamp).getTime() / 5000);
      const key = `${item.action}-${item.stage}-${roundedTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort newest first
    return deduplicated.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [order, logs, stageHistory, childOrders, staffMap]);

  // Filtered timeline
  const filteredTimeline = useMemo(() => {
    return timelineEvents.filter((item) => {
      // Role/Stage Filter
      if (selectedFilter !== 'ALL') {
        const roleMatch = item.actorRole?.toUpperCase().includes(selectedFilter);
        const stageMatch = item.stage?.toUpperCase().includes(selectedFilter);
        if (!roleMatch && !stageMatch) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesAction = item.action?.toLowerCase().includes(q);
        const matchesActor = item.actorName?.toLowerCase().includes(q);
        const matchesDesc = item.description?.toLowerCase().includes(q);
        const matchesRole = item.actorRole?.toLowerCase().includes(q);
        if (!matchesAction && !matchesActor && !matchesDesc && !matchesRole) return false;
      }

      return true;
    });
  }, [timelineEvents, selectedFilter, searchQuery]);

  const customerName = order?.customerSnapshot?.displayName || order?.customerSnapshot?.name || 'Unknown Account';
  const dispatchMethod = order?.delivery?.choice || order?.dispatchInfo?.method || 'PICKUP';

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'SUPPORT', 'ACCOUNTS']}>
      <div className="font-sans text-slate-800 bg-gradient-to-br from-[#cad6fa] via-[#d4e4fc] to-[#bce1f8] -m-4 p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8 relative z-10 min-h-[calc(100vh-4rem)] rounded-none overflow-hidden pb-12">
        {/* Dynamic Glassmorphism Background with glowing orbs */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
          <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-[#93c5fd]/30 blur-[140px] pointer-events-none animate-pulse"></div>
          <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[#c4b5fd]/30 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-[#a5f3fc]/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        {/* ONE Master Glass Container */}
        <div className="relative z-10 rounded-[2.5rem] bg-white/60 backdrop-blur-xl shadow-lg border border-white/50 p-6 md:p-8 space-y-8 max-w-6xl mx-auto">
          
          {/* Top Header Card */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 pb-6">
            <div className="flex items-center gap-3 min-w-0">
              <button 
                onClick={() => router.push('/admin/orders')}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/80 border border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white transition-all shadow-sm shrink-0"
              >
                <ArrowLeft size={16} />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                    Order #{orderId.replace('ORD-', '')} — Full Activity Ledger
                  </h1>
                  <span className="inline-flex items-center rounded-full border border-slate-200/60 bg-white/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-700 shadow-sm">
                    {order?.status || 'ACTIVE'}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                  Complete chronological audit trail of all actions, operators, and stage transitions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</p>
                <p className="text-sm font-black text-slate-900 truncate">{customerName}</p>
              </div>
              <div className="h-8 w-px bg-slate-200 hidden sm:block" />
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grand Total</p>
                <p className="text-sm font-black text-emerald-700">₹{order?.amounts?.grandTotal?.toLocaleString('en-IN') || '0'}</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Loading Order History & Activity Ledger...</p>
            </div>
          ) : (
            <div className="space-y-8">

              {/* 1. Workflow Pipeline Visualizer */}
              {order?.workflowSnapshot && (
                <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-md p-6 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                      <Activity size={16} />
                    </span>
                    <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">Workflow Pipeline</h2>
                  </div>
                  <WorkflowPipelineVisual 
                    snapshot={order.workflowSnapshot} 
                    orderId={orderId} 
                    detailed={true} 
                    filterByRoles={true} 
                    allowNavigation={false} 
                  />
                </div>
              )}

              {/* 2. Child Orders & Production Items Routing (If multi-item or split) */}
              {(childOrders.length > 0 || (order.items && order.items.length > 0)) && (
                <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-md p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                        <Layers size={16} />
                      </span>
                      <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                        Item & Sub-Order Breakdown ({childOrders.length || (order.items ? order.items.length : 1)} Items)
                      </h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {childOrders.length > 0 ? (
                      childOrders.map((child, idx) => (
                        <div key={child.id} className="rounded-xl border border-slate-200/80 bg-white/90 p-4 space-y-2.5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Child #{idx + 1}</span>
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase text-slate-600">
                              {child.status}
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-slate-900 truncate">{child.id}</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Category: {child.printerCategory || 'General'}</p>
                          {child.assignedPrinterName && (
                            <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                              <Printer size={10} /> Printer: {child.assignedPrinterName}
                            </p>
                          )}
                          {child.tiffPath && (
                            <p className="text-[9px] font-mono text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100 break-all">
                              {child.tiffPath}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      (order.items || []).map((item: any, idx: number) => (
                        <div key={item.id || idx} className="rounded-xl border border-slate-200/80 bg-white/90 p-4 space-y-2.5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Item #{idx + 1}</span>
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase text-slate-600">
                              {item.specs?.quantity || 1} Qty
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-slate-900 truncate">{item.productName || item.name || 'Print Item'}</h4>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Size: {item.specs?.width || item.width || 0} x {item.specs?.height || item.height || 0} {item.specs?.widthUnit || 'FT'}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 3. Comprehensive Activity & Audit Timeline Stream */}
              <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-md p-6 shadow-sm space-y-6">
                
                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/60 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                      <Clock size={16} />
                    </span>
                    <div>
                      <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                        Complete Activity Ledger ({filteredTimeline.length} Events)
                      </h2>
                      <p className="text-[10px] text-slate-500 font-medium">Chronological record of all updates</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
                    {/* Search Input */}
                    <div className="relative flex-1 sm:w-48">
                      <Search size={12} className="absolute left-3 top-2.5 text-slate-400" />
                      <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search timeline..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    {/* Role Filter Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                      {['ALL', 'DESIGNER', 'MANAGER', 'PRINTER', 'PASTING', 'FINISHING', 'DISPATCH'].map((role) => (
                        <button
                          key={role}
                          onClick={() => setSelectedFilter(role)}
                          className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${
                            selectedFilter === role 
                              ? 'bg-slate-900 text-white shadow-sm' 
                              : 'bg-white/80 border border-slate-200/80 text-slate-600 hover:bg-white'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Timeline Stream */}
                {filteredTimeline.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs italic">
                    No matching activity events found for the selected filter.
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 pb-2">
                    {filteredTimeline.map((item, index) => {
                      const isFirst = index === 0;

                      return (
                        <div key={item.id || index} className="relative pl-6">
                          {/* Timeline Dot */}
                          <div className={`absolute -left-[9px] top-1.5 p-0.5 rounded-full bg-white border-2 ${
                            isFirst ? 'border-blue-600 text-blue-600' : 'border-slate-300 text-slate-400'
                          }`}>
                            <Circle size={10} className={isFirst ? 'fill-blue-600 text-blue-600' : 'fill-slate-400 text-slate-400'} />
                          </div>

                          {/* Event Card */}
                          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm hover:shadow-md transition-all space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                  item.actorRole === 'CUSTOMER' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                                  item.actorRole === 'DESIGNER' ? 'bg-purple-50 border-purple-200 text-purple-800' :
                                  item.actorRole === 'MANAGER' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
                                  item.actorRole === 'PRINTER' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                                  item.actorRole === 'PASTING' ? 'bg-teal-50 border-teal-200 text-teal-800' :
                                  item.actorRole === 'FINISHING' ? 'bg-cyan-50 border-cyan-200 text-cyan-800' :
                                  item.actorRole === 'DISPATCH' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                                  'bg-slate-100 border-slate-200 text-slate-700'
                                }`}>
                                  {item.actorRole || 'SYSTEM'}
                                </span>
                                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                                  {item.action}
                                </h3>
                              </div>

                              <div className="flex items-center gap-2 text-slate-400 text-[11px] font-medium shrink-0">
                                <Calendar size={12} />
                                <span>{formatLogDate(item.timestamp)}</span>
                              </div>
                            </div>

                            {/* Actor Details & Action Description */}
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="space-y-1 flex-1">
                                <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                                  {item.description}
                                </p>
                                {item.itemRef && (
                                  <span className="inline-block mt-1 text-[9px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                    Target: {item.itemRef}
                                  </span>
                                )}
                              </div>

                              {/* Actor Badge */}
                              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200/60 shrink-0 self-start">
                                <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-black uppercase">
                                  {item.actorName.charAt(0)}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Actor</span>
                                  <span className="text-[11px] font-black text-slate-900 leading-tight">{item.actorName}</span>
                                </div>
                              </div>
                            </div>

                            {/* Proof Image / File Path Attached */}
                            {item.proofUrl && (
                              <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
                                <a 
                                  href={item.proofUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="group relative h-16 w-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 block shrink-0"
                                >
                                  <img src={item.proofUrl} alt="Stage Proof" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                                </a>
                                <div>
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Attached Proof Photo</p>
                                  <a 
                                    href={item.proofUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline mt-0.5"
                                  >
                                    <ExternalLink size={11} /> Open full proof
                                  </a>
                                </div>
                              </div>
                            )}

                            {item.filePath && (
                              <div className="pt-2 border-t border-slate-100">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Production File Path</p>
                                <p className="text-[10px] font-mono bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-800 break-all">
                                  {item.filePath}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
