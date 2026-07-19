'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, where, getDoc, doc } from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';
import { useSearchParams, useRouter } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { Order } from '@/types/models';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';
import {
  AlertCircle,
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle,
  ClipboardList,
  Loader2,
  Package,
  Search,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PLACED: { label: 'Order Placed', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: <Activity size={12} /> },
  DESIGNING: { label: 'Designing', color: 'bg-purple-50 text-purple-600 border-purple-200', icon: <Activity size={12} /> },
  DESIGN_READY: { label: 'Design Ready', color: 'bg-indigo-50 text-indigo-600 border-indigo-200', icon: <Activity size={12} /> },
  PAYMENT_PENDING: { label: 'Payment Pending', color: 'bg-yellow-50 text-yellow-600 border-yellow-200', icon: <Activity size={12} /> },
  PAYMENT_VERIFIED: { label: 'Payment Verified', color: 'bg-teal-50 text-teal-600 border-teal-200', icon: <CheckCircle size={12} /> },
  ASSIGNED: { label: 'Assigned to Press', color: 'bg-orange-50 text-orange-600 border-orange-200', icon: <Truck size={12} /> },
  IN_PROGRESS: { label: 'In Production', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Loader2 size={12} className="animate-spin" /> },
  COMPLETED: { label: 'Completed', color: 'bg-green-50 text-green-600 border-green-200', icon: <CheckCircle size={12} /> },
  DISPATCHED: { label: 'Dispatched', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Truck size={12} /> },
  DELIVERED: { label: 'Delivered', color: 'bg-green-50 text-green-600 border-green-200', icon: <CheckCircle size={12} /> },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-50 text-red-500 border-red-200', icon: <Activity size={12} /> },
};

export function GlobalOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [limitCount, setLimitCount] = useState(100);
  const [hasMore, setHasMore] = useState(true);
  const [totalStats, setTotalStats] = useState({ total: 0, active: 0, completed: 0 });
  const [tab, setTab] = useState<'global' | 'stage' | 'completed' | 'completed_by_me' | 'worked_by_me'>('global');
  const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [parentTotals, setParentTotals] = useState<Record<string, number>>({});
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);

  const searchParams = useSearchParams();
  const highlightParam = searchParams.get('highlight');

  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined' && highlightParam) {
      setHighlightedIds(highlightParam.split(','));
      
      // Use Next.js router to clear the query param without reloading
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('highlight');
      router.replace(newUrl.pathname + newUrl.search, { scroll: false });

      setTimeout(() => {
        setHighlightedIds([]);
      }, 10000);
    }
  }, [highlightParam, router]);

  // Robust auto-scroll when orders load
  useEffect(() => {
    if (highlightedIds.length > 0) {
      const firstId = highlightedIds[0];
      let attempts = 0;
      let interval: NodeJS.Timeout;
      
      const tryScroll = () => {
        const row = document.getElementById(`order-row-${firstId}`);
        if (row) {
          // Add a slight delay to ensure browser paints before scrolling
          setTimeout(() => {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
          clearInterval(interval);
        } else if (attempts > 50) { // 50 * 200ms = 10 seconds timeout
          clearInterval(interval);
        }
        attempts++;
      };

      interval = setInterval(tryScroll, 200);
      tryScroll(); // Initial try

      return () => clearInterval(interval);
    }
  }, [highlightedIds, orders]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const totalSnap = await getCountFromServer(collection(db, 'orders'));
        const activeQ = query(collection(db, 'orders'), where('status', 'not-in', ['COMPLETED', 'DISPATCHED', 'CANCELLED', 'DELIVERED']));
        const activeSnap = await getCountFromServer(activeQ);
        const completedQ = query(collection(db, 'orders'), where('status', 'in', ['COMPLETED', 'DISPATCHED', 'DELIVERED']));
        const completedSnap = await getCountFromServer(completedQ);
        setTotalStats({
          total: totalSnap.data().count,
          active: activeSnap.data().count,
          completed: completedSnap.data().count,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
  }, []);

  useEffect(() => {
    let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(limitCount));
    
    if (dateRange.start) {
      q = query(q, where('createdAt', '>=', dateRange.start.toISOString()));
    }
    if (dateRange.end) {
      const endOfDay = new Date(dateRange.end);
      endOfDay.setHours(23, 59, 59, 999);
      q = query(q, where('createdAt', '<=', endOfDay.toISOString()));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[];
      const baseOrderIdSet = new Set(allOrders.map(o => (o as any).baseOrderId).filter(Boolean));
      const visible = allOrders.filter(o => {
        const hasBaseOrderId = !!(o as any).baseOrderId;          // is a child item
        const isUmbrellaParent = baseOrderIdSet.has(o.id);        // its ID is used as baseOrderId by others
        const hasGroupChildren = Array.isArray((o as any).workflow?.groupOrderIds) && (o as any).workflow.groupOrderIds.length > 0;
        if (hasBaseOrderId) return true;            // always show child items
        if (isUmbrellaParent || hasGroupChildren) return false;  // hide umbrella parents
        return true;                                // standalone single-item order
      });
      setOrders(visible);
      setHasMore(snapshot.docs.length === limitCount);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [limitCount, dateRange]);

  // Fetch parent order grandTotal for child orders (child amounts are zeroed)
  useEffect(() => {
    const fetchParentTotals = async () => {
      const missingBaseIds = orders
        .map(o => (o as any).baseOrderId)
        .filter((id): id is string => !!id && !parentTotals[id]);

      if (missingBaseIds.length === 0) return;

      const uniqueBaseIds = Array.from(new Set(missingBaseIds));
      const newTotals = { ...parentTotals };

      await Promise.all(uniqueBaseIds.map(async (baseId) => {
        try {
          const snap = await getDoc(doc(db, 'orders', baseId));
          if (snap.exists()) {
            const data = snap.data();
            newTotals[baseId] = data?.amounts?.grandTotal ?? 0;
          }
        } catch (e) {
          console.error(e);
        }
      }));

      setParentTotals(newTotals);
    };
    fetchParentTotals();
  }, [orders]);

  const auth = useAuth();
  const viewerRoles = auth?.roles || [];
  const viewerUid = auth?.profile?.uid || auth?.user?.uid || '';

  const operationalRoles = React.useMemo(() => {
    return viewerRoles.filter(r => r !== 'ADMIN' && r !== 'SUPER_ADMIN' && r !== 'ACDEMA');
  }, [viewerRoles]);

  const stageOrders = React.useMemo(() => {
    return orders.filter((order) => {
      if (!order.status || ['COMPLETED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(order.status.toUpperCase())) return false;

      const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
      if (!currentStep || currentStep.status === 'COMPLETED') return false;

      const currentRole = (order.currentWorkflowRole || currentStep?.role || '').toUpperCase();
      if (!currentRole) return false;

      const includedByUserRole = viewerRoles.includes(currentRole as any);
      const includedByDirectAssignment = viewerUid && order.workflow?.assignedTo === viewerUid;
      const includedByProxyAssignment = viewerUid && order.proxyExecutor?.uid === viewerUid;

      return includedByUserRole || includedByDirectAssignment || includedByProxyAssignment;
    });
  }, [orders, viewerUid, viewerRoles]);

  const completedStageOrders = React.useMemo(() => {
    return orders.filter((order) => {
      const completedByStep = (order.workflowSnapshot?.steps || []).some(
        (s) => {
          const isUserCompleted = s.completedBy === viewerUid || (s.history || []).some((h) => h.by === viewerUid && h.status === 'COMPLETED');
          const isRoleCompleted = s.status === 'COMPLETED' && operationalRoles.includes(s.role as any);
          return isUserCompleted || isRoleCompleted;
        }
      );
      const completedByCustom =
        (order as any).dispatchCompletedBy === viewerUid ||
        (order.dispatchInfo as any)?.dispatchedBy === viewerUid ||
        (order.workflow?.['deliveredAt'] && order.workflowSnapshot?.steps?.some(s => s.role === 'DELIVERY' && s.completedBy === viewerUid));
      return completedByStep || completedByCustom;
    });
  }, [orders, viewerUid, operationalRoles]);

  const completedByMeOrders = React.useMemo(() => {
    return orders.filter((order) => {
      const completedByStep = (order.workflowSnapshot?.steps || []).some(
        (s) => s.completedBy === viewerUid || (s.history || []).some((h) => h.by === viewerUid && h.status === 'COMPLETED')
      );
      const completedByCustom =
        (order as any).dispatchCompletedBy === viewerUid ||
        (order.dispatchInfo as any)?.dispatchedBy === viewerUid ||
        (order.workflow?.['deliveredAt'] && order.workflowSnapshot?.steps?.some(s => s.role === 'DELIVERY' && s.completedBy === viewerUid));
      return completedByStep || completedByCustom;
    });
  }, [orders, viewerUid]);

  const workedByMeOrders = React.useMemo(() => {
    const matched = orders.filter((order) => {
      const workedInSteps = (order.workflowSnapshot?.steps || []).some(
        (s: any) => s.assignedTo === viewerUid || s.completedBy === viewerUid || (s.history || []).some((h: any) => h.by === viewerUid)
      );
      const isCreator = order.createdBy === viewerUid;
      const workedCustom = (order as any).dispatchCompletedBy === viewerUid || (order.dispatchInfo as any)?.dispatchedBy === viewerUid;
      return workedInSteps || isCreator || workedCustom;
    });

    // Sort by latest action by this user
    return matched.slice().sort((a, b) => {
      const getLatestActionTime = (o: Order) => {
        let maxTime = 0;
        if (o.createdBy === viewerUid && o.createdAt) {
          const ct = typeof o.createdAt === 'string' ? new Date(o.createdAt).getTime() : (o.createdAt as any).seconds ? (o.createdAt as any).seconds * 1000 : 0;
          if (ct > maxTime) maxTime = ct;
        }
        (o.workflowSnapshot?.steps || []).forEach((s: any) => {
          (s.history || []).forEach((h: any) => {
            if (h.by === viewerUid && (h.at || h.timestamp)) {
              const val = h.at || h.timestamp;
              const t = typeof val === 'string' ? new Date(val).getTime() : val.seconds ? val.seconds * 1000 : 0;
              if (t > maxTime) maxTime = t;
            }
          });
        });
        return maxTime;
      };
      return getLatestActionTime(b) - getLatestActionTime(a);
    });
  }, [orders, viewerUid]);

  const activeOrders = React.useMemo(() => {
    if (tab === 'stage') return stageOrders;
    if (tab === 'completed') return completedStageOrders;
    if (tab === 'completed_by_me') return completedByMeOrders;
    if (tab === 'worked_by_me') return workedByMeOrders;
    return orders;
  }, [tab, orders, stageOrders, completedStageOrders, completedByMeOrders, workedByMeOrders]);

  const filtered = activeOrders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.status?.toLowerCase().includes(search.toLowerCase()) ||
      order.currentWorkflowLabel?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerSnapshot?.name?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerSnapshot?.phone?.toLowerCase().includes(search.toLowerCase());
    const isOwnedByAcdema = viewerUid && (order.createdBy === viewerUid || order.proxyExecutor?.uid === viewerUid);

    // Authorization: if viewer is ACDEMA (non-admin) show only accountant/designer/manager stages by default.
    const isAdmin = viewerRoles.includes('ADMIN') || viewerRoles.includes('SUPER_ADMIN');
    if (isAdmin) return matchesSearch;

    if (viewerRoles.includes('ACDEMA')) {
      if (tab === 'global') return matchesSearch;
      const acdemaDefaults = ['ACCOUNTANT', 'DESIGNER', 'MANAGER'];
      const extra = viewerRoles.filter(r => r !== 'ACDEMA');
      const allowed = new Set([...acdemaDefaults, ...extra]);
      const currentRole = order.currentWorkflowRole || order.currentWorkflowLabel;
      const isAllowedStage = !!currentRole && allowed.has(currentRole as any);
      return matchesSearch && (isOwnedByAcdema || isAllowedStage);
    }

    return matchesSearch;
  });

  return (
    <RoleGuard allowedRoles={['ACDEMA', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="w-full space-y-4 pb-10">
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-4 bg-white py-3 border-b border-slate-200 -mt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded text-white">
              <ClipboardList size={18} />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 uppercase tracking-wider">Global Order Registry</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight opacity-70">Unified Print Operations Oversight</p>
            </div>
          </div>

          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1 self-start lg:self-auto flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setTab('global')}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                tab === 'global' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ClipboardList size={13} /> Global Orders ({totalStats.total || orders.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('stage')}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                tab === 'stage' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <AlertCircle size={13} /> At My Stage ({stageOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('completed')}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                tab === 'completed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <CheckCircle size={13} /> Completed At My Stage ({completedStageOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('completed_by_me')}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                tab === 'completed_by_me' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <CheckCircle size={13} /> Completed By Me ({completedByMeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('worked_by_me')}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                tab === 'worked_by_me' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Activity size={13} /> Recent Orders Worked By Me ({workedByMeOrders.length})
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded border border-slate-200">
            {[
              { label: 'Total', value: totalStats.total, color: 'text-slate-600', icon: Package },
              { label: 'Active', value: totalStats.active, color: 'text-indigo-600', icon: Activity },
              { label: 'Done', value: totalStats.completed, color: 'text-emerald-600', icon: CheckCircle },
            ].map((stat) => (
              <div key={stat.label} className="bg-white px-4 py-1.5 rounded flex items-center gap-3 min-w-[100px] border border-slate-200/50 shadow-sm">
                <stat.icon size={12} className={stat.color} />
                <div className="leading-none">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{stat.label}</p>
                  <p className={`text-xs font-black ${stat.color}`}>{stat.value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="px-4 flex gap-4 flex-col md:flex-row">
          <div className="flex-1 relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search manifest by ID, Customer, Phone..."
              className="w-full bg-white border border-slate-200 rounded px-10 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all shadow-sm"
            />
          </div>

          <div className="relative">
            <button 
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`px-4 h-11 bg-white border rounded text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:border-slate-900 transition-all flex items-center gap-2 ${dateRange.start || dateRange.end ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-slate-200'}`}
            >
              <Calendar size={14} />
              {dateRange.start && dateRange.end 
                ? `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}` 
                : dateRange.start ? `From ${dateRange.start.toLocaleDateString()}`
                : dateRange.end ? `Until ${dateRange.end.toLocaleDateString()}`
                : 'Time Range'}
            </button>

            {showDatePicker && (
              <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-50 w-72 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Select Range</span>
                  <button onClick={() => { setDateRange({start: null, end: null}); setShowDatePicker(false); }} className="text-[10px] text-slate-400 hover:text-red-500 uppercase font-bold tracking-widest transition-colors">Clear</button>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Start Date</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-200 rounded p-2 text-sm outline-none focus:border-indigo-500"
                    value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value ? new Date(e.target.value) : null }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">End Date</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-200 rounded p-2 text-sm outline-none focus:border-indigo-500"
                    value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value ? new Date(e.target.value) : null }))}
                  />
                </div>
                <button 
                  onClick={() => setShowDatePicker(false)}
                  className="mt-2 w-full bg-slate-900 text-white rounded py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors"
                >
                  Apply Filter
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-4">
          <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Node ID</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Identity</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 min-w-[550px]">Operational Status</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Dispatch</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Settlement</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center tabular-nums">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Registry...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center tabular-nums">
                        <p className="text-xs font-bold text-slate-400 uppercase italic tracking-widest">No matching records found</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((order) => {
                      const statusKey = order.status && STATUS_CONFIG[order.status] ? order.status : 'PLACED';
                      const cfg = STATUS_CONFIG[statusKey];
                      let date = '—';
                      if (order.createdAt) {
                        const parsed = (order.createdAt as any).seconds ? new Date((order.createdAt as any).seconds * 1000) : new Date(order.createdAt as any);
                        if (!Number.isNaN(parsed.getTime())) {
                          date = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed);
                        }
                      }
                      const baseOrderId = (order as any).baseOrderId;
                      const amount = baseOrderId
                        ? (parentTotals[baseOrderId] ?? 0)
                        : (order.amounts?.grandTotal ?? (order as any).grandTotal ?? 0);
                      const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? -1];
                      const isDesignerStepActive = currentStep?.role === 'DESIGNER';
                      const thumbnail = <OrderThumbnail orderId={order.id} order={order as any} size="sm" />;
                      const isHighlighted = highlightedIds.includes(order.id);

                      return (
                        <tr id={`order-row-${order.id}`} key={order.id} className={`${isHighlighted ? 'bg-indigo-50 shadow-inner transition-all duration-1000' : 'hover:bg-slate-50 transition-colors'} group`}>
                          <td className="px-4 py-3 tabular-nums">
                            <div className="flex items-center gap-2">
                              {isDesignerStepActive ? (
                                <Link 
                                  href={`/designer/orders/${order.id}?returnTo=/acdema/orders`}
                                  className="hover:brightness-90 transition-all cursor-pointer"
                                  title="Open creative studio workstation"
                                >
                                  {thumbnail}
                                </Link>
                              ) : (
                                thumbnail
                              )}
                              <div>
                                <p className="text-[11px] font-black text-slate-900 leading-none mb-0.5 font-mono">#{order.id.replace('ORD-', '')}</p>
                                <p className="text-[9px] font-bold text-slate-400 tracking-tighter uppercase">{date}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <p className="text-xs font-bold text-slate-800 leading-none mb-0.5">{order.customerSnapshot?.name || 'Guest'}</p>
                            <p className="text-[10px] font-medium text-slate-400">{order.customerSnapshot?.phone || 'No phone'}</p>
                            {order.proxyExecutor && (
                              <div className="mt-1">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[8px] font-black text-indigo-600 uppercase tracking-widest break-all">
                                  Proxy: {(() => {
                                    const proxy = typeof order.proxyExecutor === 'string' ? JSON.parse(order.proxyExecutor) : order.proxyExecutor;
                                    return order.proxyName || proxy?.name || (proxy?.role === 'ACDEMA' ? 'AcDema Support' : 'Admin');
                                  })()}
                                </span>
                              </div>
                            )}
                            <div className="text-[9px] font-medium text-slate-500 mt-1 line-clamp-2">
                              {order.items?.map(i => i.productName).join(', ') || order.workflow?.printWorkflow?.tiffFileName || 'Custom Print'}
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-tight ${cfg.color.split(' shadow')[0]}`}>
                                  {React.isValidElement(cfg.icon) ? React.cloneElement(cfg.icon, { size: 10 }) : cfg.icon}
                                  {cfg.label}
                                </span>
                                {order.currentWorkflowLabel && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                    <span className="text-[8px] text-slate-400">Current Role:</span>
                                    <span className="text-slate-700">{order.currentWorkflowLabel}</span>
                                  </span>
                                )}
                              </div>
                              <div className="mt-1">
                                  <WorkflowPipelineVisual
                                    snapshot={(() => {
                                      const dispatchMethodKey = order.dispatchInfo?.method || order.delivery?.choice || 'COUNTER';
                                      const isDeliverySkipped = ['pickup', 'transport', 'courier', 'counter'].includes((dispatchMethodKey || '').toLowerCase());
                                      if (isDeliverySkipped && order.workflowSnapshot?.steps) {
                                        return {
                                          ...order.workflowSnapshot,
                                          steps: order.workflowSnapshot.steps.filter((s: any) => s.role !== 'DELIVERY')
                                        };
                                      }
                                      return order.workflowSnapshot;
                                    })()}
                                    orderId={order.id}
                                    detailed={true}
                                    filterByRoles={false}
                                    allowNavigation={true}
                                  />
                                {((order.status === 'DELIVERED') || (order.workflow?.['deliveredAt']) || (order.currentWorkflowLabel === 'COMPLETED') || ((order.workflowSnapshot?.currentStepIndex ?? -1) >= (order.workflowSnapshot?.steps?.length ?? 0))) && (
                                  <div className="mt-3 rounded-md bg-emerald-50 border border-emerald-100 p-3 text-emerald-700">
                                    <p className="text-sm font-black">ORDER COMPLETED</p>
                                    <p className="text-xs">All workflow stages are completed. No further actions are required.</p>
                                    <p className="text-[11px] font-medium mt-1">Completed on {(() => {
                                      const completedAt = (order.workflow?.['deliveredAt'] as any) || (() => {
                                        const steps = order.workflowSnapshot?.steps ?? [];
                                        return steps.length ? steps[steps.length - 1]?.completedAt : undefined;
                                      })();
                                      if (!completedAt) return '—';
                                      const parsed = (completedAt as any).seconds 
                                        ? new Date((completedAt as any).seconds * 1000) 
                                        : new Date(completedAt as any);
                                      if (Number.isNaN(parsed.getTime())) return '—';
                                      return parsed.toLocaleDateString('en-IN');
                                    })()}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <div className="flex items-center gap-1.5">
                              <Truck size={10} className="text-slate-400" />
                              <p className="text-[10px] font-bold text-slate-600 uppercase">{order.dispatchInfo?.method || 'Standard'}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <p className="text-xs font-black text-slate-900 tracking-tight">₹{amount.toLocaleString()}</p>
                            <div className="flex items-center justify-end gap-1">
                              <div className={`w-1 h-1 rounded-full ${order.paymentStatus === 'VERIFIED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              <p className={`text-[9px] font-black uppercase ${order.paymentStatus === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-500'}`}>
                                {order.paymentStatus === 'VERIFIED' ? 'Verified' : 'Pending'}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            <Link
                              href={`/acdema/orders/${order.id}`}
                              className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-200 bg-white text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm group-hover:scale-105"
                            >
                              <ArrowRight size={14} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {hasMore && !search && !loading && (
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-center">
                <button
                  onClick={() => setLimitCount((prev) => prev + 20)}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-2"
                >
                  Fetch Next Batch <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

