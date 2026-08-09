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
  FileText,
  Loader2,
  Package,
  Search,
  Truck,
  Filter,
  ChevronDown,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCreateDrawer } from '@/components/dashboard/create-drawer';

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
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string | null>(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [siblingsModal, setSiblingsModal] = useState<{ orders: any[], parentId: string } | null>(null);
  const [selectedSiblingIds, setSelectedSiblingIds] = useState<Set<string>>(new Set());
  const [modalProcessing, setModalProcessing] = useState(false);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);

  const fetchInvoices = async () => {
    try {
      const orgId = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (orgId) headers['x-organization-id'] = orgId;
      const res = await fetch('/api/v1/invoices?limit=200', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          setInvoicesList(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch invoices list:', err);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const getInvoiceForOrder = (order: any) => {
    const directId = (order as any).invoice_id || (order as any).invoiceId;
    const directNumber = (order as any).invoice_number || (order as any).invoiceNumber;
    if (directId || directNumber) {
      return { id: directId, number: directNumber };
    }

    const cleanId = order.id.replace('ORD-', '');
    const parentId = cleanId.split('-')[0];

    const match = invoicesList.find((inv: any) => {
      if (!inv.reference) return false;
      const ref = String(inv.reference);
      return (
        ref === parentId ||
        ref === order.id ||
        ref === cleanId ||
        ref === `ORDER #${parentId}` ||
        ref === `#${parentId}` ||
        ref.includes(parentId) ||
        ref.includes(order.id)
      );
    });

    if (match) {
      return { id: match.id, number: match.number || match.invoice_number || match.code };
    }

    return null;
  };

  const { open: openDrawer } = useCreateDrawer();

  const handleInvoiceMultiple = async (ordersToProcess: any[]) => {
    try {
      if (ordersToProcess.length === 0) return;
      const firstOrder = ordersToProcess[0];
      setProcessingOrderId(firstOrder.id);
      setModalProcessing(true);
      const orgId = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (orgId) headers['x-organization-id'] = orgId;
      let contactId: string | undefined;
      const contactName = firstOrder.customerSnapshot?.name;
      if (contactName && contactName !== 'Guest') {
        const sr = await fetch(`/api/v1/contacts?search=${encodeURIComponent(contactName)}&limit=1`, { headers });
        if (sr.ok) { const sd = await sr.json(); if (sd.data?.length > 0) contactId = sd.data[0].id; }
        if (!contactId) {
          const cr = await fetch('/api/v1/contacts', { method: 'POST', headers, body: JSON.stringify({ name: contactName, phone: firstOrder.customerSnapshot?.phone || null, type: 'customer' }) });
          if (cr.ok) { const cd = await cr.json(); if (cd.contact) contactId = cd.contact.id; }
        }
      }

      let taxRates: any[] = [];
      try { const tr = await fetch('/api/v1/tax-rates', { headers }); if (tr.ok) { const td = await tr.json(); taxRates = td.taxRates || []; } } catch {}

      let inventory: any[] = [];
      try { const ir = await fetch('/api/v1/inventory?limit=1000', { headers }); if (ir.ok) { const id2 = await ir.json(); inventory = id2.data || []; } } catch {}

      const parseJson = (val: any) => { if (typeof val === 'string') { try { return JSON.parse(val); } catch { return null; } } return val; };

      const allMappedLines: any[] = [];
      let totalDeliveryCharge = 0;
      let orderDelivery: any = {};

      for (const order of ordersToProcess) {
        const parsedItems = parseJson(order.items) || (Array.isArray(order.items) ? order.items : []);
        const parsedAmounts = parseJson(order.amounts) || (order.amounts || {});
        const orderGstDecimal = ((Number(order.cgst_percentage || 0) + Number(order.sgst_percentage || 0)) || Number(order.igst_percentage || 0)) / 100;

        const mappedLines = (Array.isArray(parsedItems) ? parsedItems : []).map((i: any) => {
          const rawWidth = Number(i.specs?.width ?? i.width ?? 0);
          const rawHeight = Number(i.specs?.height ?? i.height ?? 0);
          const widthUnit = i.specs?.widthUnit ?? 'FT';
          const heightUnit = i.specs?.heightUnit ?? 'FT';
          const widthFt = widthUnit === 'IN' ? rawWidth / 12 : rawWidth;
          const heightFt = heightUnit === 'IN' ? rawHeight / 12 : rawHeight;
          const qty = Number(i.specs?.quantity ?? i.quantity ?? 1);
          const pricingSnap = parseJson(i.pricingSnapshot ?? i.pricing_snapshot) || {};
          const eyeletType = pricingSnap.selectedEyeletType ?? 'NONE';
          const eyeletRate = Number(pricingSnap.eyeletRate ?? 0);
          const eyeletCount = eyeletType !== 'NONE' ? qty : 0;
          const finishAmount = (eyeletCount * eyeletRate).toFixed(2);
          let gstDecimal = Number(pricingSnap.tax ?? 0);
          if (gstDecimal === 0 && orderGstDecimal > 0) gstDecimal = orderGstDecimal;
          else if (gstDecimal === 0) gstDecimal = 0.18;
          const gstBasisPts = Math.round(gstDecimal * 10000);
          const matchedTax = taxRates.find((t: any) => t.rate === gstBasisPts);
          const matchedInventory = inventory.find((inv: any) => inv.name.toLowerCase() === (i.productName || '').toLowerCase());
          let desc = i.productName || 'Custom Print';
          if (widthFt > 0 && heightFt > 0) desc += ` (${widthFt} FT x ${heightFt} FT)`;
          if (eyeletCount > 0) desc += ` + ${eyeletCount} ${eyeletType.toLowerCase()} eyelets`;
          const baseRate = parseFloat((pricingSnap.baseRate ?? i.unitPrice ?? i.price ?? i.rate ?? 0).toString()) || 0;
          const totalFinish = parseFloat(finishAmount || '0');
          return { description: desc, quantity: qty.toString(), unitPrice: baseRate.toFixed(2), accountId: '', taxRateId: matchedTax?.id ?? '', inventoryItemId: matchedInventory?.id ?? '', width: widthFt > 0 ? widthFt.toString() : '', length: heightFt > 0 ? heightFt.toString() : '', sqFt: widthFt > 0 && heightFt > 0 ? (widthFt * heightFt).toFixed(2) : '', finishAmount: totalFinish > 0 ? totalFinish.toFixed(2) : '' };
        });

        if (mappedLines.length === 0) {
          mappedLines.push({ description: 'Custom Print Order', quantity: '1', unitPrice: (parsedAmounts.grandTotal ?? order.grandTotal ?? 0).toString(), accountId: '', taxRateId: '', inventoryItemId: '', width: '', length: '', sqFt: '', finishAmount: '' });
        }
        allMappedLines.push(...mappedLines);

        totalDeliveryCharge += Number(order.allocated_logistics_amount ?? parsedAmounts.transport ?? parsedAmounts.deliveryCharges ?? 0);

        if (Object.keys(orderDelivery).length === 0 && order.delivery) {
          try { orderDelivery = typeof order.delivery === 'string' ? JSON.parse(order.delivery) : order.delivery; } catch {}
        }
      }

      if (totalDeliveryCharge > 0) allMappedLines.push({ description: 'Logistics / Shipping', quantity: '1', unitPrice: totalDeliveryCharge.toFixed(2), accountId: '', taxRateId: '', inventoryItemId: '', width: '', length: '', sqFt: '', finishAmount: '' });

      const parentRef = (firstOrder as any).parent_order_id || (firstOrder as any).baseOrderId || firstOrder.id.replace('ORD-', '').split('-')[0];
      openDrawer('invoice', { reference: parentRef, contactId, lines: allMappedLines, deliveryMode: orderDelivery.choice || undefined, deliveryAddress: orderDelivery.address || undefined });
      setSiblingsModal(null);
      setTimeout(() => fetchInvoices(), 3000);
    } catch (err) {
      console.error('Failed to generate invoice', err);
      openDrawer('invoice', { reference: ordersToProcess[0]?.id });
    } finally {
      setProcessingOrderId(null);
      setModalProcessing(false);
    }
  };

  const handleReceipt = async (order: any) => {
    try {
      setProcessingOrderId(order.id);
      const contactName = order.customerSnapshot?.name || 'Guest';
      const amount = order.amounts?.grandTotal ?? (order as any).grandTotal ?? (order as any).grand_total_snapshot ?? 0;
      
      openDrawer('customerCredit', {
        contactName,
        amount: amount.toString(),
        notes: `Receipt for Order #${order.id.replace('ORD-', '')}`,
        reference: order.id
      });
    } catch (err) {
      console.error('Failed to open receipt', err);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const ALL_WORKFLOW_ROLES = [
    { id: 'ACCOUNTANT', label: 'Accounts Approval', color: 'bg-teal-100' },
    { id: 'DESIGNER',   label: 'Design & Artwork',  color: 'bg-purple-100' },
    { id: 'MANAGER',    label: 'Manager Sign-Off',  color: 'bg-blue-100' },
    { id: 'PRINTER',    label: 'Printing',          color: 'bg-orange-100' },
    { id: 'PASTING',    label: 'Pasting',           color: 'bg-amber-100' },
    { id: 'FINISHING',  label: 'Finishing',         color: 'bg-lime-100' },
    { id: 'DISPATCH',   label: 'Dispatch',          color: 'bg-cyan-100' },
    { id: 'DELIVERY',   label: 'Delivery',          color: 'bg-green-100' },
  ];

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
      // Collect all IDs that appear as a parent/base in any child order
      const parentOrderIdSet = new Set(
        allOrders
          .map(o => (o as any).parent_order_id || (o as any).baseOrderId)
          .filter(Boolean)
      );
      const visible = allOrders.filter(o => {
        const parentId = (o as any).parent_order_id || (o as any).baseOrderId;
        const hasParent = !!parentId;
        // This order is referenced as a parent by at least one child
        const isUmbrellaParent = parentOrderIdSet.has(o.id);
        
        // Check groupOrderIds on the workflow (the parent stores child IDs here)
        let hasGroupChildren = false;
        try {
          const wf = typeof o.workflow === 'string' ? JSON.parse(o.workflow) : (o.workflow || {});
          // Fix: use > 0 not > 1 — hide parent even if it has only 1 child
          hasGroupChildren = Array.isArray(wf?.groupOrderIds) && wf.groupOrderIds.length > 0;
        } catch(e) {}
        
        if (hasParent) return true;                           // always show child orders
        if (isUmbrellaParent || hasGroupChildren) return false; // hide parent orders
        return true;                                           // standalone order — show
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
        .map(o => (o as any).parent_order_id || (o as any).baseOrderId)
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

  const isViewerAdmin = viewerRoles.includes('ADMIN') || viewerRoles.includes('SUPER_ADMIN');
  const roleFilterOptions = isViewerAdmin
    ? ALL_WORKFLOW_ROLES
    : ALL_WORKFLOW_ROLES.filter(r => viewerRoles.includes(r.id as any));

  const filtered = activeOrders.filter((order) => {
    // Role stage filter
    if (selectedRoleFilter) {
      const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
      const currentRole = (order.currentWorkflowRole || currentStep?.role || '').toUpperCase();
      if (currentRole !== selectedRoleFilter || order.status === 'CANCELLED') return false;
    }
    const matchesSearch =
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.status?.toLowerCase().includes(search.toLowerCase()) ||
      order.currentWorkflowLabel?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerSnapshot?.name?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerSnapshot?.phone?.toLowerCase().includes(search.toLowerCase());
    const isOwnedByAcdema = viewerUid && (order.createdBy === viewerUid || order.proxyExecutor?.uid === viewerUid);
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
      <div className="font-sans text-slate-800 bg-[#d4d4d8] -m-4 p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8 relative z-10 min-h-[calc(100vh-4rem)] rounded-none">
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {/* Grid Pattern */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>

          {/* Abstract Shapes */}
          <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-400/40 blur-[140px] pointer-events-none animate-pulse"></div>
          <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-fuchsia-400/40 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-400/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
        </div>

        <div className="w-full relative z-10">
          <section className="relative z-50 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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

        <div className="relative z-40 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 mb-6 flex gap-4 flex-col md:flex-row">
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

          {/* Role Stage Filter */}
          {roleFilterOptions.length > 0 && (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setRoleDropdownOpen(v => !v)}
                onBlur={() => setTimeout(() => setRoleDropdownOpen(false), 150)}
                className={`h-9 flex items-center gap-2 rounded border px-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                  selectedRoleFilter
                    ? 'border-blue-400 bg-blue-600 text-white shadow-md'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                }`}
              >
                <Filter size={11} />
                {selectedRoleFilter
                  ? (ALL_WORKFLOW_ROLES.find(r => r.id === selectedRoleFilter)?.label ?? selectedRoleFilter)
                  : 'All Stages'}
                <ChevronDown size={11} className={`transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-[9999] w-52 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Filter by Stage</p>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setSelectedRoleFilter(null); setRoleDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-black text-left transition-colors ${
                        !selectedRoleFilter ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                      All Stages
                      <span className="ml-auto text-[9px] font-bold opacity-60">{activeOrders.length}</span>
                    </button>
                    {roleFilterOptions.map(roleOpt => {
                      const count = activeOrders.filter(o => {
                        const step = o.workflowSnapshot?.steps?.[o.workflowSnapshot?.currentStepIndex ?? 0];
                        const cr = (o.currentWorkflowRole || step?.role || '').toUpperCase();
                        return cr === roleOpt.id && o.status !== 'CANCELLED';
                      }).length;
                      return (
                        <button
                          key={roleOpt.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setSelectedRoleFilter(roleOpt.id); setRoleDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-black text-left transition-colors ${
                            selectedRoleFilter === roleOpt.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedRoleFilter === roleOpt.id ? 'bg-white' : roleOpt.color}`} />
                          {roleOpt.label}
                          {count > 0 && (
                            <span className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                              selectedRoleFilter === roleOpt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

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

        <div className="relative z-30 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
          <div className="bg-white/40 rounded-2xl border border-white/60 shadow-sm overflow-hidden backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                 <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-300">
                    <th className="px-4 py-3 text-slate-800" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 700, lineHeight: '22px' }}>Node ID</th>
                    <th className="px-4 py-3 text-slate-800" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 700, lineHeight: '22px' }}>Identity</th>
                    <th className="px-4 py-3 text-slate-800 min-w-[550px]" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 700, lineHeight: '22px' }}>Operational Status</th>
                    <th className="px-4 py-3 text-slate-800" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 700, lineHeight: '22px' }}>Dispatch</th>
                    <th className="px-4 py-3 text-slate-800 text-right" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 700, lineHeight: '22px' }}>Settlement</th>
                    <th className="px-4 py-3 text-slate-800 text-center" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 700, lineHeight: '22px' }}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y-0">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center tabular-nums">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Synchronizing Registry...</p>
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
                    filtered.map((order, idx) => {
                      const statusKey = order.status && STATUS_CONFIG[order.status] ? order.status : 'PLACED';
                      const cfg = STATUS_CONFIG[statusKey];
                      let date = '—';
                      if (order.createdAt) {
                        const parsed = (order.createdAt as any).seconds ? new Date((order.createdAt as any).seconds * 1000) : new Date(order.createdAt as any);
                        if (!Number.isNaN(parsed.getTime())) {
                          date = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed);
                        }
                      }
                      const baseOrderId = (order as any).parent_order_id || (order as any).baseOrderId;
                      const amount = order.amounts?.grandTotal ?? (order as any).grandTotal ?? (order as any).grand_total_snapshot ?? 0;
                      const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? -1];
                      const isDesignerStepActive = currentStep?.role === 'DESIGNER';
                      const thumbnail = <OrderThumbnail orderId={order.id} order={order as any} size="sm" />;
                      const isHighlighted = highlightedIds.includes(order.id);

                      const cleanId = order.id.replace('ORD-', '');
                      const parentOrderNum = cleanId.split('-')[0];

                      let groupIdx = 0;
                      let lastParent = "";
                      for (let i = 0; i <= idx; i++) {
                        const p = filtered[i].id.replace('ORD-', '').split('-')[0];
                        if (i > 0 && p !== lastParent) {
                          groupIdx++;
                        }
                        lastParent = p;
                      }

                      const nextOrder = filtered[idx + 1];
                      const nextParentNum = nextOrder ? nextOrder.id.replace('ORD-', '').split('-')[0] : null;
                      const isLastItemOfGroup = idx === filtered.length - 1 || nextParentNum !== parentOrderNum;

                      const isFirstOfGroup = idx === 0 || filtered[idx - 1].id.replace('ORD-', '').split('-')[0] !== parentOrderNum;
                      const isEvenGroup = groupIdx % 2 === 0;
                      const rowBg = isEvenGroup ? 'bg-white hover:bg-slate-50' : 'bg-slate-100/90 hover:bg-slate-200/80';
                      const tdBorder = isLastItemOfGroup
                        ? 'border-b-[4px] border-slate-950 shadow-sm'
                        : 'border-b border-dashed border-slate-300';

                      return (
                        <React.Fragment key={order.id}>

                          <tr id={`order-row-${order.id}`} className={`${isHighlighted ? 'bg-indigo-50 shadow-inner transition-all duration-1000' : rowBg + ' transition-colors'} group`}>
                            <td className={`px-4 py-2 tabular-nums ${tdBorder}`}>
                              <div className="flex items-center gap-2.5">
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
                                <div className="flex flex-col justify-center">
                                  <p className="text-slate-900 font-mono" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 600, lineHeight: '18px' }}>#{order.id.replace('ORD-', '')}</p>
                                  <p className="text-slate-500" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '12px', fontWeight: 400, lineHeight: '16px' }}>{date}</p>
                                </div>
                              </div>
                            </td>
                            <td className={`px-4 py-2 tabular-nums ${tdBorder}`}>
                              <div className="flex flex-col justify-center">
                                <div className="flex items-center gap-2">
                                  <p className="text-slate-900" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 600, lineHeight: '20px' }}>{order.customerSnapshot?.name || 'Guest'}</p>
                                  <p className="text-slate-500" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '13px', fontWeight: 400, lineHeight: '20px' }}>{order.customerSnapshot?.phone || 'No phone'}</p>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {order.proxyExecutor && (
                                    <span className="inline-block px-1.5 py-[1px] rounded bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-600 uppercase tracking-widest break-all">
                                      Proxy: {(() => {
                                        const proxy = typeof order.proxyExecutor === 'string' ? JSON.parse(order.proxyExecutor) : order.proxyExecutor;
                                        return order.proxyName || proxy?.name || (proxy?.role === 'ACDEMA' ? 'AcDema Support' : 'Admin');
                                      })()}
                                    </span>
                                  )}
                                  <div className="text-slate-600 truncate max-w-[180px]" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '13px', fontWeight: 500 }}>
                                    {order.items?.map(i => i.productName).join(', ') || order.workflow?.printWorkflow?.tiffFileName || 'Custom Print'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className={`px-4 py-2 tabular-nums ${tdBorder}`}>
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
                            </td>
                            <td className={`px-4 py-2 tabular-nums ${tdBorder}`}>
                              <div className="flex items-center gap-1.5">
                                <Truck size={12} className="text-slate-500" />
                                <p className="text-slate-700" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '14px', fontWeight: 500, lineHeight: '22px' }}>{order.dispatchInfo?.method || 'Standard'}</p>
                              </div>
                            </td>
                            <td className={`px-4 py-2 text-right tabular-nums ${tdBorder}`}>
                              <p className="text-slate-900" style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '16px', fontWeight: 700, lineHeight: '24px' }}>₹{amount.toLocaleString()}</p>
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${order.paymentStatus === 'VERIFIED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                <p className={`uppercase ${order.paymentStatus === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-500'}`} style={{ fontFamily: '"Inter", "Segoe UI", sans-serif', fontSize: '12px', fontWeight: 600 }}>
                                  {order.paymentStatus === 'VERIFIED' ? 'Verified' : 'Pending'}
                                </p>
                              </div>
                            </td>
                            <td className={`px-4 py-2 text-center tabular-nums ${tdBorder}`}>
                              <div className="flex flex-row items-center justify-end gap-2 flex-wrap">
                                <Link
                                  href={`/acdema/orders/${order.id}`}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm group-hover:scale-105 shrink-0"
                                  title="View Order Details"
                                >
                                  <ArrowRight size={14} />
                                </Link>
                                <div className="flex flex-row items-center gap-1.5 flex-wrap justify-end">
                                   {(() => {
                                     const matchedInvoice = getInvoiceForOrder(order);
                                     if (matchedInvoice || (order as any).is_invoice_generated || (order as any).isInvoiceGenerated) {
                                       const invNum = matchedInvoice?.number || (order as any).invoice_number || (order as any).invoiceNumber || 'Invoiced';
                                       const invId = matchedInvoice?.id || (order as any).invoice_id || (order as any).invoiceId;
                                       return (
                                         <button
                                           className="w-full text-center text-[10px] font-black uppercase tracking-widest text-emerald-700 border border-emerald-300 bg-emerald-50 rounded py-1 inline-flex items-center justify-center gap-1 shadow-sm hover:bg-emerald-100 transition-colors cursor-pointer"
                                           title={`Invoice #${invNum}`}
                                           onClick={() => {
                                             if (invId) {
                                               window.location.href = `http://40.81.236.61:3000/sales/${invId}`;
                                             } else {
                                               window.location.href = `http://40.81.236.61:3000/accounting/sales`;
                                             }
                                           }}
                                         >
                                           <CheckCircle size={9} className="text-emerald-600" />
                                           {invNum}
                                         </button>
                                       );
                                     }
                                     return (
                                       <button
                                         disabled={processingOrderId === order.id || modalProcessing}
                                         onClick={() => {
                                           const parentId = order.id.replace('ORD-', '').split('-')[0];
                                           const siblings = filtered.filter((o: any) => o.id.replace('ORD-', '').split('-')[0] === parentId);
                                           if (siblings.length > 1) {
                                             setSiblingsModal({ orders: siblings, parentId });
                                             setSelectedSiblingIds(new Set([order.id]));
                                             return;
                                           }
                                           handleInvoiceMultiple([order]);
                                         }}
                                         className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded py-1 transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                                         title="Generate Invoice"
                                       >
                                         {processingOrderId === order.id ? <Loader2 size={9} className="animate-spin" /> : <FileText size={9} />}
                                         Invoice
                                       </button>
                                     );
                                   })()}
                                  <button
                                    disabled={processingOrderId === order.id}
                                    onClick={() => handleReceipt(order)}
                                    className="w-full text-center text-[10px] font-bold uppercase tracking-widest text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-600 hover:text-white rounded py-1 transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1"
                                    title="Record Customer Prepayment"
                                  >
                                    {processingOrderId === order.id ? <Loader2 size={9} className="animate-spin" /> : null}
                                    Receipt
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
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
      </div>

      {siblingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <FileText size={16} className="text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Select Items to Invoice</p>
                  <p className="text-[10px] text-slate-400 font-medium">Parent: {siblingsModal.parentId}</p>
                </div>
              </div>
              <button onClick={() => setSiblingsModal(null)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 flex-1 space-y-2 bg-slate-50">
              {siblingsModal.orders.map((o: any) => {
                const isSelected = selectedSiblingIds.has(o.id);
                return (
                  <div
                    key={o.id}
                    onClick={() => {
                      const next = new Set(selectedSiblingIds);
                      if (next.has(o.id)) next.delete(o.id);
                      else next.add(o.id);
                      setSelectedSiblingIds(next);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${isSelected ? 'border-indigo-500 bg-indigo-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'} transition-all cursor-pointer`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300'}`}>
                      {isSelected && <CheckCircle size={10} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{o.id.replace('ORD-', '')}</p>
                      <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                        {o.items?.map((i: any) => i.productName).join(', ') || 'Custom Print'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black ${isSelected ? 'text-indigo-600' : 'text-slate-900'}`}>₹{(o.amounts?.grandTotal ?? (o as any).grandTotal ?? (o as any).grand_total_snapshot ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-100 bg-white flex gap-3">
              <button onClick={() => setSiblingsModal(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
              <button
                disabled={selectedSiblingIds.size === 0 || modalProcessing}
                onClick={() => {
                  const selected = siblingsModal.orders.filter((o: any) => selectedSiblingIds.has(o.id));
                  handleInvoiceMultiple(selected);
                }}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {modalProcessing ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                Generate Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );

}
