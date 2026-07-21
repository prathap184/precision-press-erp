'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, where, getDoc, doc } from '@/lib/supabase-firestore-shim';
import { ArrowRight, ClipboardList, Loader2, Search, UserCheck, AlertCircle, ChevronDown, Filter } from 'lucide-react';

import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Order } from '@/types/models';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';

const STATUS_TONE: Record<string, string> = {
  PLACED: 'bg-blue-50 text-blue-700 border-blue-200',
  ACCOUNTANT_APPROVED: 'bg-teal-50 text-teal-700 border-teal-200',
  DESIGNING: 'bg-purple-50 text-purple-700 border-purple-200',
  CUSTOMER_APPROVAL_PENDING: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  DESIGN_READY: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PAYMENT_PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  PAYMENT_VERIFIED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ASSIGNED: 'bg-orange-50 text-orange-700 border-orange-200',
  IN_PROGRESS: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  DISPATCHED: 'bg-slate-100 text-slate-700 border-slate-200',
  DELIVERED: 'bg-green-50 text-green-700 border-green-200',
};

function formatDate(value: any) {
  if (!value) return '—';
  const date = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function AcdemaOrdersPanel({ initialMode = 'global' }: { initialMode?: 'global' | 'mine' | 'stage' }) {
  const { profile, roles } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'global' | 'mine' | 'stage'>(initialMode);
  const [stats, setStats] = useState({ total: 0, active: 0, done: 0 });
  const [parentTotals, setParentTotals] = useState<Record<string, number>>({});
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string | null>(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const ALL_WORKFLOW_ROLES = [
    { id: 'ACCOUNTANT', label: 'Accounts Approval', color: 'bg-teal-100 text-teal-700' },
    { id: 'DESIGNER',   label: 'Design & Artwork',  color: 'bg-purple-100 text-purple-700' },
    { id: 'MANAGER',    label: 'Manager Sign-Off',  color: 'bg-blue-100 text-blue-700' },
    { id: 'PRINTER',    label: 'Printing',          color: 'bg-orange-100 text-orange-700' },
    { id: 'PASTING',    label: 'Pasting',           color: 'bg-amber-100 text-amber-700' },
    { id: 'FINISHING',  label: 'Finishing',         color: 'bg-lime-100 text-lime-700' },
    { id: 'DISPATCH',   label: 'Dispatch',          color: 'bg-cyan-100 text-cyan-700' },
    { id: 'DELIVERY',   label: 'Delivery',          color: 'bg-green-100 text-green-700' },
  ];

  const isAdmin = roles?.includes('ADMIN') || roles?.includes('SUPER_ADMIN');
  const roleOptions = isAdmin
    ? ALL_WORKFLOW_ROLES
    : ALL_WORKFLOW_ROLES.filter(r => roles?.includes(r.id as any));

  useEffect(() => {
    setMode(initialMode as 'global' | 'mine' | 'stage');
  }, [initialMode]);

  React.useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(120));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Order[];
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
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load ACDEMA orders:', error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

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

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const totalSnap = await getCountFromServer(collection(db, 'orders'));
        const activeQuery = query(collection(db, 'orders'), where('status', 'not-in', ['COMPLETED', 'DISPATCHED', 'CANCELLED', 'DELIVERED']));
        const activeSnap = await getCountFromServer(activeQuery);
        const doneQuery = query(collection(db, 'orders'), where('status', 'in', ['COMPLETED', 'DISPATCHED', 'DELIVERED']));
        const doneSnap = await getCountFromServer(doneQuery);

        setStats({
          total: totalSnap.data().count,
          active: activeSnap.data().count,
          done: doneSnap.data().count,
        });
      } catch (error) {
        console.error('Failed to fetch ACDEMA stats:', error);
      }
    };

    fetchStats();
  }, []);

  const myOrders = useMemo(() => {
    const uid = profile?.uid || '';
    if (!uid) return [] as Order[];

    return orders.filter((order) => {
      const createdByMe = order.createdBy === uid;
      const proxyByMe = order.proxyExecutor?.uid === uid;
      return createdByMe || proxyByMe;
    });
  }, [orders, profile?.uid]);

  const uid = profile?.uid || '';
  const effectiveRoles = roles || [];

  const stageOrders = useMemo(() => {
    const uid = profile?.uid || '';
    const effectiveRoles = roles || [];

    return orders.filter((order) => {
      const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
      const currentRole = (order.currentWorkflowRole || currentStep?.role || '').toUpperCase();
      if (!currentRole || order.status === 'CANCELLED') return false;

      const includedByUserRole = effectiveRoles.includes(currentRole as any);
      const includedByDirectAssignment = uid && order.workflow?.assignedTo === uid;
      const includedByProxyAssignment = uid && order.proxyExecutor?.uid === uid;

      return includedByUserRole || includedByDirectAssignment || includedByProxyAssignment;
    });
  }, [orders, profile?.uid, roles]);

  const activeSource = mode === 'global' ? orders : mode === 'mine' ? myOrders : stageOrders;
  const headerTitle = mode === 'global' ? 'Global Orders & My Jobs' : mode === 'mine' ? 'My Jobs' : 'Jobs At My Stage';

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = activeSource;

    // Role stage filter
    if (selectedRoleFilter) {
      result = result.filter((order) => {
        const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
        const currentRole = (order.currentWorkflowRole || currentStep?.role || '').toUpperCase();
        return currentRole === selectedRoleFilter && order.status !== 'CANCELLED';
      });
    }

    if (!term) return result;
    return result.filter((order) => {
      return (
        order.id.toLowerCase().includes(term) ||
        (order.customerSnapshot?.name || '').toLowerCase().includes(term) ||
        (order.customerSnapshot?.phone || '').toLowerCase().includes(term) ||
        (order.status || '').toLowerCase().includes(term) ||
        (order.currentWorkflowLabel || '').toLowerCase().includes(term)
      );
    });
  }, [activeSource, search, selectedRoleFilter]);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">ACDEMA Dashboard</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">{headerTitle}</h2>
        </div>
        <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode('global')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition ${
              mode === 'global' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ClipboardList size={13} /> Global Orders ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setMode('mine')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition ${
              mode === 'mine' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserCheck size={13} /> My Jobs ({myOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setMode('stage')}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition ${
              mode === 'stage' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <AlertCircle size={13} /> At My Stage ({stageOrders.length})
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
          <p className="text-[7px] uppercase tracking-[0.15em] text-slate-400 mb-0.5">Total</p>
          <p className="text-lg font-black text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
          <p className="text-[7px] uppercase tracking-[0.15em] text-slate-400 mb-0.5">Active</p>
          <p className="text-lg font-black text-slate-900">{stats.active}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
          <p className="text-[7px] uppercase tracking-[0.15em] text-slate-400 mb-0.5">Done</p>
          <p className="text-lg font-black text-slate-900">{stats.done}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search manifest by ID, Customer, Phone..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-8 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Role Stage Filter Dropdown */}
        {roleOptions.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setRoleDropdownOpen(v => !v)}
              onBlur={() => setTimeout(() => setRoleDropdownOpen(false), 150)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                selectedRoleFilter
                  ? 'border-blue-400 bg-blue-600 text-white shadow-md'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:border-slate-300'
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
                    <span className="ml-auto text-[9px] font-bold opacity-60">{activeSource.length}</span>
                  </button>
                  {roleOptions.map(role => {
                    const count = activeSource.filter(o => {
                      const step = o.workflowSnapshot?.steps?.[o.workflowSnapshot?.currentStepIndex ?? 0];
                      const cr = (o.currentWorkflowRole || step?.role || '').toUpperCase();
                      return cr === role.id && o.status !== 'CANCELLED';
                    }).length;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setSelectedRoleFilter(role.id); setRoleDropdownOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-black text-left transition-colors ${
                          selectedRoleFilter === role.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedRoleFilter === role.id ? 'bg-white' : role.color.split(' ')[0]}`} />
                        {role.label}
                        {count > 0 && (
                          <span className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                            selectedRoleFilter === role.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
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
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Node ID</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Identity</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Reason</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 min-w-[500px]">Operational Status</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Dispatch</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Settlement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center tabular-nums">
                  <div className="inline-flex items-center gap-2 text-slate-500">
                    <Loader2 size={16} className="animate-spin" />
                    Loading orders...
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-sm font-semibold text-slate-500 tabular-nums">
                  No orders found for this view.
                </td>
              </tr>
                ) : (
              filtered.map((order) => {
                const tone = STATUS_TONE[order.status] || 'bg-slate-100 text-slate-700 border-slate-200';
                const date = formatDate(order.createdAt);
                 const baseOrderId = (order as any).baseOrderId;
                 const amount = baseOrderId
                   ? (parentTotals[baseOrderId] ?? 0)
                   : (order.amounts?.grandTotal ?? order.grandTotal ?? 0);
                // compute inclusion reason
                const currentStep = order.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? 0];
                const currentRole = (order.currentWorkflowRole || currentStep?.role || '').toUpperCase();
                const includedByDirectAssignment = uid && order.workflow?.assignedTo === uid;
                const includedByProxyAssignment = uid && order.proxyExecutor?.uid === uid;
                const includedByUserRole = currentRole && effectiveRoles.includes(currentRole as any);
                const inclusionReason = includedByDirectAssignment ? 'Assigned' : includedByProxyAssignment ? 'Proxy Assigned' : includedByUserRole ? 'Role Match' : order.createdBy === uid ? 'Created' : 'Global';
                return (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-4 align-top tabular-nums">
                      <div className="font-mono text-[11px] font-black text-slate-900">#{order.id.replace('ORD-', '')}</div>
                      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400 mt-1">{date}</div>
                      <div className="text-[10px] font-bold text-slate-600 mt-1.5 line-clamp-2 leading-tight">
                        {order.items?.map(i => i.productName).join(', ') || order.workflow?.printWorkflow?.tiffFileName || 'Custom Print'}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top tabular-nums">
                      <p className="text-sm font-bold text-slate-900">{order.customerSnapshot?.name || 'Guest'}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{order.customerSnapshot?.phone || 'No phone'}</p>
                      {order.proxyExecutor && (
                        <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[8px] font-black text-indigo-600 uppercase tracking-widest break-all">
                          Proxy: {(() => {
                            const proxy = typeof order.proxyExecutor === 'string' ? JSON.parse(order.proxyExecutor) : order.proxyExecutor;
                            return order.proxyName || proxy?.name || (proxy?.role === 'ACDEMA' ? 'AcDema Support' : 'Admin');
                          })()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top tabular-nums">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">{inclusionReason}</span>
                    </td>
                    <td className="px-4 py-4 align-top tabular-nums">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${tone}`}>
                            {order.currentWorkflowLabel || order.status}
                          </span>
                          {order.currentWorkflowLabel && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                              <span className="text-[8px] uppercase tracking-[0.2em]">Current Role:</span>
                              {order.currentWorkflowLabel}
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <WorkflowPipelineVisual
                            snapshot={order.workflowSnapshot}
                            orderId={order.id}
                            detailed={true}
                            filterByRoles={false}
                            allowNavigation={true}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top tabular-nums">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{order.dispatchInfo?.method || 'Standard'}</div>
                    </td>
                    <td className="px-4 py-4 text-right align-top tabular-nums">
                      <p className="text-sm font-black text-slate-900">₹{amount.toLocaleString()}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <div className={`w-2 h-2 rounded-full ${order.paymentStatus === 'VERIFIED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <p className={`text-[9px] font-black uppercase ${order.paymentStatus === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-500'}`}>
                          {order.paymentStatus === 'VERIFIED' ? 'Verified' : 'Pending'}
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

