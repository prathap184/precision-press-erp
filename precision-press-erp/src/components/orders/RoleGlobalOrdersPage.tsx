'use client';

/**
 * RoleGlobalOrdersPage
 *
 * A role-scoped Global Order Registry with ALL original filters:
 *   - Global / At My Stage / Completed Stage / By Me / Recent tabs
 *   - "All Stages" dropdown (shows only stages based on viewer's assigned roles)
 *   - Time Range date picker
 *   - Search by ID, Customer, Phone
 *
 * Workflow pipeline: all stages visible, but ONLY the viewer's role(s) are clickable.
 * Invoice/Receipt buttons hidden for shop-floor roles.
 * Multi-role staff: all assigned roles' boxes are clickable.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  getDoc,
  doc,
} from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';
import { useSearchParams, useRouter } from 'next/navigation';
import { Order } from '@/types/models';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle,
  ChevronDown,
  ClipboardList,
  Filter,
  Loader2,
  Lock,
  Package,
  Search,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { StaffRole } from '@/types/roles';

// ── Role metadata ──────────────────────────────────────────────────────────────
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

// Roles that should NOT see Invoice / Receipt action buttons
const SHOP_FLOOR_ROLES: StaffRole[] = [
  'DESIGNER', 'PRINTER', 'PASTING', 'FINISHING', 'DISPATCH', 'DELIVERY', 'SUPPORT',
];

const ROLE_LABELS: Partial<Record<StaffRole, string>> = {
  DESIGNER: 'Designer', PRINTER: 'Printer', PASTING: 'Pasting',
  FINISHING: 'Finishing', DISPATCH: 'Dispatch', DELIVERY: 'Delivery',
  SUPPORT: 'Support', MANAGER: 'Manager', ACCOUNTANT: 'Accountant',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PLACED:           { label: 'Order Placed',      color: 'bg-blue-50 text-blue-600 border-blue-200' },
  DESIGNING:        { label: 'Designing',          color: 'bg-purple-50 text-purple-600 border-purple-200' },
  DESIGN_READY:     { label: 'Design Ready',       color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  PAYMENT_PENDING:  { label: 'Payment Pending',    color: 'bg-yellow-50 text-yellow-600 border-yellow-200' },
  PAYMENT_VERIFIED: { label: 'Payment Verified',   color: 'bg-teal-50 text-teal-600 border-teal-200' },
  ASSIGNED:         { label: 'Assigned to Press',  color: 'bg-orange-50 text-orange-600 border-orange-200' },
  IN_PROGRESS:      { label: 'In Production',      color: 'bg-amber-50 text-amber-700 border-amber-200' },
  COMPLETED:        { label: 'Completed',          color: 'bg-green-50 text-green-600 border-green-200' },
  DISPATCHED:       { label: 'Dispatched',         color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  DELIVERED:        { label: 'Delivered',          color: 'bg-green-50 text-green-600 border-green-200' },
  CANCELLED:        { label: 'Cancelled',          color: 'bg-red-50 text-red-500 border-red-200' },
};

type TabType = 'global' | 'stage' | 'completed' | 'completed_by_me' | 'worked_by_me';

interface RoleGlobalOrdersPageProps {
  primaryRole: StaffRole;
}

export function RoleGlobalOrdersPage({ primaryRole }: RoleGlobalOrdersPageProps) {
  const auth = useAuth();
  // All roles this staff member has (from admin staff assignment)
  const viewerRoles: StaffRole[] = (auth?.roles?.length ? auth.roles : [primaryRole]) as StaffRole[];
  const viewerUid = auth?.profile?.uid || auth?.user?.uid || '';

  // Operational roles (exclude admin/super-admin for filtering logic)
  const operationalRoles = viewerRoles.filter(
    r => r !== 'ADMIN' && r !== 'SUPER_ADMIN'
  );

  // Stages locked for clicking in pipeline — viewer's own roles only
  const effectiveLockedRoles: StaffRole[] = operationalRoles;

  // Show Invoice/Receipt only for financial/management roles
  const canSeeFinancialActions =
    viewerRoles.includes('ADMIN') ||
    viewerRoles.includes('SUPER_ADMIN') ||
    viewerRoles.includes('ACDEMA' as StaffRole) ||
    viewerRoles.includes('ACCOUNTANT') ||
    viewerRoles.includes('MANAGER');

  // ── State ──────────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [limitCount, setLimitCount] = useState(100);
  const [hasMore, setHasMore] = useState(true);
  const [totalStats, setTotalStats] = useState({ total: 0, active: 0, completed: 0 });
  const [tab, setTab] = useState<TabType>('global');
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [parentTotals, setParentTotals] = useState<Record<string, number>>({});
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string | null>(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();

  // "All Stages" dropdown options — show ALL stages for admin/super-admin,
  // only the viewer's assigned roles for everyone else
  const isViewerAdmin = viewerRoles.includes('ADMIN') || viewerRoles.includes('SUPER_ADMIN');
  const roleFilterOptions = isViewerAdmin
    ? ALL_WORKFLOW_ROLES
    : ALL_WORKFLOW_ROLES.filter(r => viewerRoles.includes(r.id as any));

  // ── Highlight from URL ?highlight= ────────────────────────────────────────
  useEffect(() => {
    const h = searchParams?.get('highlight');
    if (h && typeof window !== 'undefined') {
      setHighlightedIds(h.split(','));
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('highlight');
      router.replace(newUrl.pathname + newUrl.search, { scroll: false });
      setTimeout(() => setHighlightedIds([]), 10000);
    }
  }, [searchParams, router]);

  // ── Auto-scroll to highlighted row ────────────────────────────────────────
  useEffect(() => {
    if (!highlightedIds.length) return;
    let attempts = 0;
    const interval = setInterval(() => {
      const row = document.getElementById(`order-row-${highlightedIds[0]}`);
      if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); clearInterval(interval); }
      else if (attempts++ > 50) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [highlightedIds, orders]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const totalSnap = await getCountFromServer(collection(db, 'orders'));
        const activeQ = query(collection(db, 'orders'), where('status', 'not-in', ['COMPLETED', 'DISPATCHED', 'CANCELLED', 'DELIVERED']));
        const activeSnap = await getCountFromServer(activeQ);
        const completedQ = query(collection(db, 'orders'), where('status', 'in', ['COMPLETED', 'DISPATCHED', 'DELIVERED']));
        const completedSnap = await getCountFromServer(completedQ);
        setTotalStats({ total: totalSnap.data().count, active: activeSnap.data().count, completed: completedSnap.data().count });
      } catch {}
    })();
  }, []);

  // ── Live orders listener ───────────────────────────────────────────────────
  useEffect(() => {
    let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(limitCount));
    if (dateRange.start) q = query(q, where('createdAt', '>=', dateRange.start.toISOString()));
    if (dateRange.end) {
      const end = new Date(dateRange.end); end.setHours(23, 59, 59, 999);
      q = query(q, where('createdAt', '<=', end.toISOString()));
    }
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[];
      const parentIdSet = new Set(all.map(o => {
        const wf = (() => { try { return typeof (o as any).workflow === 'string' ? JSON.parse((o as any).workflow) : ((o as any).workflow || {}); } catch { return {}; } })();
        return (o as any).parent_order_id || (o as any).baseOrderId || wf?.baseOrderId;
      }).filter(Boolean));
      const visible = all.filter(o => {
        const wf = (() => { try { return typeof (o as any).workflow === 'string' ? JSON.parse((o as any).workflow) : ((o as any).workflow || {}); } catch { return {}; } })();
        const pid = (o as any).parent_order_id || (o as any).baseOrderId || wf?.baseOrderId;
        if (pid) return true;
        if (parentIdSet.has(o.id)) return false;
        if (Array.isArray(wf?.groupOrderIds) && wf.groupOrderIds.length > 0) return false;
        return true;
      });
      setOrders(visible);
      setHasMore(snap.docs.length === limitCount);
      setLoading(false);
    });
    return () => unsub();
  }, [limitCount, dateRange]);

  // ── Parent totals for child orders ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const missing = orders.map(o => (o as any).parent_order_id || (o as any).baseOrderId)
        .filter((id): id is string => !!id && !parentTotals[id]);
      if (!missing.length) return;
      const unique = Array.from(new Set(missing));
      const newTotals = { ...parentTotals };
      await Promise.all(unique.map(async id => {
        try {
          const s = await getDoc(doc(db, 'orders', id));
          if (s.exists()) newTotals[id] = s.data()?.amounts?.grandTotal ?? 0;
        } catch {}
      }));
      setParentTotals(newTotals);
    })();
  }, [orders]);

  // ── Tab-filtered order lists ───────────────────────────────────────────────
  const stageOrders = React.useMemo(() =>
    orders.filter(order => {
      if (!order.status || ['COMPLETED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(order.status.toUpperCase())) return false;
      const step = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
      if (!step || step.status === 'COMPLETED') return false;
      const cr = (order.currentWorkflowRole || step?.role || '').toUpperCase();
      const byRole = effectiveLockedRoles.includes(cr as StaffRole);
      const byAssign = viewerUid && order.workflow?.assignedTo === viewerUid;
      const byProxy = viewerUid && (order as any).proxyExecutor?.uid === viewerUid;
      return byRole || byAssign || byProxy;
    }), [orders, viewerUid, effectiveLockedRoles]);

  const completedStageOrders = React.useMemo(() =>
    orders.filter(order => {
      const completedByStep = (order.workflowSnapshot?.steps || []).some(s => {
        const byUser = s.completedBy === viewerUid || (s.history || []).some((h: any) => h.by === viewerUid && h.status === 'COMPLETED');
        const byRole = s.status === 'COMPLETED' && operationalRoles.includes(s.role as any);
        return byUser || byRole;
      });
      const completedCustom =
        (order as any).dispatchCompletedBy === viewerUid ||
        (order.dispatchInfo as any)?.dispatchedBy === viewerUid;
      return completedByStep || completedCustom;
    }), [orders, viewerUid, operationalRoles]);

  const completedByMeOrders = React.useMemo(() =>
    orders.filter(order => {
      const byStep = (order.workflowSnapshot?.steps || []).some(s =>
        s.completedBy === viewerUid || (s.history || []).some((h: any) => h.by === viewerUid && h.status === 'COMPLETED')
      );
      const byCustom = (order as any).dispatchCompletedBy === viewerUid || (order.dispatchInfo as any)?.dispatchedBy === viewerUid;
      return byStep || byCustom;
    }), [orders, viewerUid]);

  const workedByMeOrders = React.useMemo(() => {
    const matched = orders.filter(order => {
      const inSteps = (order.workflowSnapshot?.steps || []).some((s: any) =>
        s.assignedTo === viewerUid || s.completedBy === viewerUid || (s.history || []).some((h: any) => h.by === viewerUid)
      );
      const isCreator = order.createdBy === viewerUid;
      const custom = (order as any).dispatchCompletedBy === viewerUid || (order.dispatchInfo as any)?.dispatchedBy === viewerUid;
      return inSteps || isCreator || custom;
    });
    return matched.slice().sort((a, b) => {
      const getTime = (o: Order) => {
        let max = 0;
        if (o.createdBy === viewerUid && o.createdAt) {
          const ct = typeof o.createdAt === 'string' ? new Date(o.createdAt).getTime() : (o.createdAt as any).seconds ? (o.createdAt as any).seconds * 1000 : 0;
          if (ct > max) max = ct;
        }
        (o.workflowSnapshot?.steps || []).forEach((s: any) => {
          (s.history || []).forEach((h: any) => {
            if (h.by === viewerUid && (h.at || h.timestamp)) {
              const v = h.at || h.timestamp;
              const t = typeof v === 'string' ? new Date(v).getTime() : v.seconds ? v.seconds * 1000 : 0;
              if (t > max) max = t;
            }
          });
        });
        return max;
      };
      return getTime(b) - getTime(a);
    });
  }, [orders, viewerUid]);

  const computedStats = React.useMemo(() => {
    if (!orders.length) return totalStats;
    const isCompleted = (o: Order) =>
      o.status === 'DELIVERED' ||
      (o.workflowSnapshot?.steps || []).every((s: any) => s.status === 'COMPLETED');
    const completed = orders.filter(isCompleted).length;
    return { total: orders.length, active: orders.length - completed, completed };
  }, [orders, totalStats]);

  // Active orders for the selected tab
  const activeOrders = React.useMemo(() => {
    if (tab === 'stage') return stageOrders;
    if (tab === 'completed') return completedStageOrders;
    if (tab === 'completed_by_me') return completedByMeOrders;
    if (tab === 'worked_by_me') return workedByMeOrders;
    return orders;
  }, [tab, orders, stageOrders, completedStageOrders, completedByMeOrders, workedByMeOrders]);

  // Final filtered list (search + stage dropdown)
  const filtered = React.useMemo(() => {
    return activeOrders.filter(order => {
      if (selectedRoleFilter) {
        const step = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
        const cr = (order.currentWorkflowRole || step?.role || '').toUpperCase();
        if (cr !== selectedRoleFilter || order.status === 'CANCELLED') return false;
      }
      const s = search.toLowerCase();
      return !s ||
        order.id.toLowerCase().includes(s) ||
        order.status?.toLowerCase().includes(s) ||
        order.currentWorkflowLabel?.toLowerCase().includes(s) ||
        order.customerSnapshot?.name?.toLowerCase().includes(s) ||
        order.customerSnapshot?.phone?.toLowerCase().includes(s);
    });
  }, [activeOrders, selectedRoleFilter, search]);

  const roleLabel = ROLE_LABELS[primaryRole] || primaryRole;
  const tdBorder = 'border-b border-slate-100';

  // ── Tab button helper ──────────────────────────────────────────────────────
  const TabBtn = ({ value, label, count, icon }: { value: TabType; label: string; count: number; icon: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-normal whitespace-nowrap transition ${
        tab === value ? 'bg-white/90 text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
      }`}
    >
      {icon} {label} ({count})
    </button>
  );

  return (
    <div className="w-full font-sans text-slate-800 relative z-10 min-h-[calc(100vh-4rem)]">
      {/* Ambient background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#e2ecf8]" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(#bfdbfe_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
        <div className="absolute -top-[15%] -right-[10%] w-[55vw] h-[55vw] rounded-full bg-sky-200/50 blur-[130px]" />
        <div className="absolute -bottom-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-blue-200/40 blur-[130px]" />
        <div className="absolute top-[35%] left-[25%] w-[45vw] h-[45vw] rounded-full bg-sky-100/60 blur-[120px]" />
      </div>

      <div className="w-full relative z-10 p-4 sm:p-6 md:p-8">

        {/* ── TOP HEADER BAR ─────────────────────────────────────────────── */}
        <section className="relative z-50 rounded-2xl bg-white/30 px-3.5 py-1.5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-2xl border border-white/40 mb-3 flex items-center justify-between gap-3 overflow-x-auto scrollbar-hide">
          {/* Title */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="p-1.5 bg-slate-900 rounded-lg text-white">
              <ClipboardList size={14} />
            </div>
            <div>
              <h1 className="text-xs font-bold text-slate-900 tracking-tight leading-tight whitespace-nowrap">
                Global Order Registry — {roleLabel} View
              </h1>
              <p className="text-[10px] text-slate-500 leading-tight">
                Clickable stages:{' '}
                <span className="font-semibold text-blue-700">
                  {effectiveLockedRoles.length ? effectiveLockedRoles.join(', ') : 'None'}
                </span>
              </p>
            </div>
          </div>

          {/* Tabs — ALL 5 tabs from original */}
          <div className="flex items-center gap-1 bg-white/40 backdrop-blur-md p-0.5 rounded-xl border border-white/50 flex-shrink-0">
            <TabBtn value="global"         label="Global"          count={orders.length}             icon={<ClipboardList size={12} />} />
            <TabBtn value="stage"          label="At My Stage"     count={stageOrders.length}        icon={<AlertCircle size={12} />} />
            <TabBtn value="completed"      label="Completed Stage" count={completedStageOrders.length} icon={<CheckCircle size={12} />} />
            <TabBtn value="completed_by_me" label="By Me"          count={completedByMeOrders.length} icon={<CheckCircle size={12} />} />
            <TabBtn value="worked_by_me"   label="Recent"          count={workedByMeOrders.length}   icon={<Activity size={12} />} />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="bg-white/60 backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-white/60 shadow-2xs text-xs font-bold text-slate-700">
              <Package size={12} className="text-slate-500" />
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Total</span>
              <span>{computedStats.total}</span>
            </div>
            <div className="bg-white/60 backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-white/60 shadow-2xs text-xs font-bold text-indigo-700">
              <Activity size={12} className="text-indigo-500" />
              <span className="text-[10px] text-indigo-400 font-semibold uppercase">Active</span>
              <span>{computedStats.active}</span>
            </div>
            <div className="bg-white/60 backdrop-blur-md px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-white/60 shadow-2xs text-xs font-bold text-emerald-700">
              <CheckCircle size={12} className="text-emerald-500" />
              <span className="text-[10px] text-emerald-400 font-semibold uppercase">Done</span>
              <span>{computedStats.completed}</span>
            </div>
          </div>
        </section>

        {/* ── SEARCH + FILTERS ROW ───────────────────────────────────────── */}
        <div className="relative z-40 rounded-2xl bg-white/20 px-3.5 py-1.5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-2xl border border-white/30 mb-3 flex gap-2.5 items-center">
          {/* Search */}
          <div className="flex-1 relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by ID, Customer, Phone..."
              className="w-full h-8 bg-white/20 backdrop-blur-md border border-white/30 rounded-lg pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-600 focus:bg-white/40 transition-all shadow-2xs"
            />
          </div>

          {/* "All Stages" role filter — shows only the viewer's assigned roles */}
          {roleFilterOptions.length > 0 && (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setRoleDropdownOpen(v => !v)}
                onBlur={() => setTimeout(() => setRoleDropdownOpen(false), 150)}
                className={`h-8 flex items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all ${
                  selectedRoleFilter
                    ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                    : 'border-white/30 bg-white/20 backdrop-blur-md text-slate-700 hover:bg-white/40'
                }`}
              >
                <Filter size={12} />
                {selectedRoleFilter
                  ? (ALL_WORKFLOW_ROLES.find(r => r.id === selectedRoleFilter)?.label ?? selectedRoleFilter)
                  : 'All Stages'}
                <ChevronDown size={11} className={`transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-[9999] w-52 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Filter by Stage</p>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setSelectedRoleFilter(null); setRoleDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors ${
                        !selectedRoleFilter ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                      All Stages
                      <span className="ml-auto text-xs font-bold opacity-60">{activeOrders.length}</span>
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
                          onMouseDown={e => { e.preventDefault(); setSelectedRoleFilter(roleOpt.id); setRoleDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors ${
                            selectedRoleFilter === roleOpt.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedRoleFilter === roleOpt.id ? 'bg-white' : roleOpt.color}`} />
                          {roleOpt.label}
                          {count > 0 && (
                            <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full ${
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

          {/* Time Range picker */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`px-2.5 h-8 border rounded-lg text-xs font-semibold text-slate-700 hover:bg-white/40 transition-all flex items-center gap-1.5 ${
                dateRange.start || dateRange.end
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                  : 'border-white/30 bg-white/20 backdrop-blur-md'
              }`}
            >
              <Calendar size={12} />
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
                  <button onClick={() => { setDateRange({ start: null, end: null }); setShowDatePicker(false); }} className="text-xs text-slate-400 hover:text-red-500 font-bold">Clear</button>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Start Date</label>
                  <input type="date" className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                    value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                    onChange={e => setDateRange(p => ({ ...p, start: e.target.value ? new Date(e.target.value) : null }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">End Date</label>
                  <input type="date" className="w-full border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                    value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                    onChange={e => setDateRange(p => ({ ...p, end: e.target.value ? new Date(e.target.value) : null }))} />
                </div>
                <button onClick={() => setShowDatePicker(false)} className="mt-1 w-full bg-slate-900 text-white rounded-lg py-2 text-xs font-bold hover:bg-slate-800">Apply Filter</button>
              </div>
            )}
          </div>
        </div>

        {/* ── ROLE LOCK NOTICE ───────────────────────────────────────────── */}
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-800 text-xs font-medium">
          <Lock size={13} className="text-amber-500 shrink-0" />
          <span>
            Viewing all orders in the pipeline.{' '}
            Only{' '}
            <span className="font-bold text-amber-900">
              {effectiveLockedRoles.length ? effectiveLockedRoles.join(' & ') : 'your assigned'}
            </span>{' '}
            stage{effectiveLockedRoles.length !== 1 ? 's are' : ' is'} clickable — all others are locked.
          </span>
        </div>

        {/* ── ORDERS TABLE ───────────────────────────────────────────────── */}
        <div className="relative z-30 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-black/15">
                  <th className="py-3 px-3 text-slate-800 text-[13px] font-normal text-left w-[145px]">Node ID</th>
                  <th className="py-3 px-3 text-slate-800 text-[13px] font-normal text-left w-[260px]">Identity</th>
                  <th className="py-3 px-3 text-slate-800 text-[14px] font-normal text-left">Operational Status</th>
                  <th className="py-3 px-4 text-slate-800 text-[13px] font-normal text-right w-[110px]">Settlement</th>
                  {canSeeFinancialActions && (
                    <th className="py-3 px-3 text-slate-800 text-[13px] font-normal text-center w-[180px]">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y-0">
                {loading ? (
                  <tr>
                    <td colSpan={canSeeFinancialActions ? 5 : 4} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        <p className="text-[13px] font-normal text-slate-500">Synchronizing Registry...</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={canSeeFinancialActions ? 5 : 4} className="py-20 text-center">
                      <p className="text-[13px] font-normal text-slate-400 italic">No matching records found</p>
                    </td>
                  </tr>
                ) : filtered.map((order, idx) => {
                  const baseId = (order as any).parent_order_id || (order as any).baseOrderId;
                  const amounts = (order as any).amounts || {};
                  const amount = baseId ? (parentTotals[baseId] ?? amounts.grandTotal ?? 0) : (amounts.grandTotal ?? 0);
                  const isHighlighted = highlightedIds.includes(order.id);

                  let date = '—';
                  if (order.createdAt) {
                    const parsed = (order.createdAt as any).seconds
                      ? new Date((order.createdAt as any).seconds * 1000)
                      : new Date(order.createdAt as any);
                    if (!Number.isNaN(parsed.getTime())) {
                      date = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed);
                    }
                  }

                  const cleanId = order.id.replace('ORD-', '');
                  const parentOrderNum = cleanId.split('-')[0];

                  return (
                    <tr
                      key={order.id}
                      id={`order-row-${order.id}`}
                      className={`transition-colors hover:bg-blue-50/30 ${isHighlighted ? 'bg-blue-50 ring-1 ring-blue-300' : idx % 2 === 0 ? 'bg-white/30' : 'bg-white/10'}`}
                    >
                      {/* Node ID + Thumbnail */}
                      <td className={`px-3 py-2 align-top ${tdBorder}`}>
                        <div className="flex items-start gap-2">
                          <OrderThumbnail order={order} size="sm" />
                          <div className="min-w-0">
                            <p className="font-mono font-bold text-[11px] text-slate-900 truncate">#{parentOrderNum}</p>
                            {cleanId.includes('-') && (
                              <p className="font-mono text-[10px] text-slate-400 truncate">{cleanId.split('-').slice(1).join('-')}</p>
                            )}
                            <p className="text-[10px] text-slate-400 mt-0.5">{date}</p>
                          </div>
                        </div>
                      </td>

                      {/* Identity */}
                      <td className={`px-3 py-2 align-top ${tdBorder}`}>
                        <p className="font-medium text-slate-800 text-[12px] truncate max-w-[200px]">
                          {order.customerSnapshot?.name || '—'}
                        </p>
                        <p className="text-slate-400 text-[11px]">{order.customerSnapshot?.phone || ''}</p>
                        {(order as any).proxyExecutor && (
                          <p className="text-[10px] text-indigo-500 font-medium">Proxy: {(order as any).proxyExecutor?.name || ''}</p>
                        )}
                        <p className="text-[10px] text-slate-400 truncate max-w-[200px] mt-0.5">{(order as any).items?.[0]?.productName || (order as any).productName || ''}</p>
                      </td>

                      {/* Operational Status — pipeline with role locking */}
                      <td className={`px-3 py-2 align-top ${tdBorder}`}>
                        <WorkflowPipelineVisual
                          snapshot={order.workflowSnapshot}
                          orderId={order.id}
                          detailed={true}
                          filterByRoles={false}
                          allowNavigation={true}
                          lockedToRoles={effectiveLockedRoles}
                          deliveryChoice={(order as any).deliveryChoice}
                        />
                      </td>

                      {/* Settlement */}
                      <td className={`px-4 py-2 align-top text-right tabular-nums ${tdBorder}`}>
                        <p className="text-slate-900 text-[13px] font-normal">₹{amount.toLocaleString()}</p>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${order.paymentStatus === 'VERIFIED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          <p className={`text-[11px] ${order.paymentStatus === 'VERIFIED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {order.paymentStatus === 'VERIFIED' ? 'Verified' : 'Pending'}
                          </p>
                        </div>
                      </td>

                      {/* Actions — Invoice/Receipt only for financial roles */}
                      {canSeeFinancialActions && (
                        <td className={`px-3 py-2 align-top text-center ${tdBorder}`}>
                          <div className="flex items-center justify-center gap-1.5">
                            <Link
                              href={`/accounting/sales/new?orderId=${order.id}`}
                              className="text-center text-[12px] font-normal text-indigo-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg py-1 px-2.5 transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                            >
                              Invoice
                            </Link>
                            <Link
                              href={`/receipt-entry?orderId=${order.id}`}
                              className="text-center text-[12px] font-normal text-emerald-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg py-1 px-2.5 transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                            >
                              Receipt
                            </Link>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore && !loading && (
            <div className="flex items-center justify-center pt-4 border-t border-slate-100 mt-2">
              <button
                onClick={() => setLimitCount(c => c + 100)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                Load more <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
