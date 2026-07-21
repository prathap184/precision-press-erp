'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getCountFromServer, limit, onSnapshot, orderBy, query, where } from '@/lib/supabase-firestore-shim';
import { Search, Calendar, ClipboardList, Package, Activity, CheckCircle, Loader2, Truck, ArrowRight } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Order } from '@/types/models';
import { RoleGuard } from '@/lib/role-guard';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PLACED:           { label: 'Order Placed',      color: 'bg-blue-50 text-blue-600 border-blue-200',         icon: <Package size={12} /> },
  DESIGNING:        { label: 'Designing',         color: 'bg-purple-50 text-purple-600 border-purple-200',   icon: <Loader2 size={12} className="animate-spin" /> },
  DESIGN_READY:     { label: 'Design Ready',      color: 'bg-indigo-50 text-indigo-600 border-indigo-200',   icon: <ClipboardList size={12} /> },
  PAYMENT_PENDING:  { label: 'Payment Pending',   color: 'bg-yellow-50 text-yellow-600 border-yellow-200',   icon: <Activity size={12} /> },
  PAYMENT_VERIFIED: { label: 'Payment Verified',  color: 'bg-teal-50 text-teal-600 border-teal-200',         icon: <CheckCircle size={12} /> },
  ASSIGNED:         { label: 'Assigned',          color: 'bg-orange-50 text-orange-600 border-orange-200',   icon: <Truck size={12} /> },
  IN_PROGRESS:      { label: 'In Progress',       color: 'bg-amber-50 text-amber-700 border-amber-200',      icon: <Loader2 size={12} className="animate-spin" /> },
  COMPLETED:        { label: 'Completed',         color: 'bg-green-50 text-green-600 border-green-200',      icon: <CheckCircle size={12} /> },
  DISPATCHED:       { label: 'Dispatched',        color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Truck size={12} /> },
  DELIVERED:        { label: 'Delivered',         color: 'bg-green-50 text-green-600 border-green-200',      icon: <CheckCircle size={12} /> },
  CANCELLED:        { label: 'Cancelled',         color: 'bg-red-50 text-red-500 border-red-200',            icon: <Loader2 size={12} className="animate-spin" /> },
};

export function DeliveryGlobalOrders() {
  const { roles, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [limitCount, setLimitCount] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0 });
  const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>({ start: null, end: null });
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const totalSnap = await getCountFromServer(collection(db, 'orders'));
        const activeSnap = await getCountFromServer(query(collection(db, 'orders'), where('status', 'not-in', ['COMPLETED', 'DISPATCHED', 'CANCELLED', 'DELIVERED'])));
        const completedSnap = await getCountFromServer(query(collection(db, 'orders'), where('status', 'in', ['COMPLETED', 'DISPATCHED', 'DELIVERED'])));
        setStats({
          total: totalSnap.data().count,
          active: activeSnap.data().count,
          completed: completedSnap.data().count,
        });
      } catch (error) {
        console.error('Failed to fetch delivery global order stats:', error);
      }
    };

    fetchStats();
  }, []);

  useEffect(() => {
    let q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    if (dateRange.start) {
      q = query(q, where('createdAt', '>=', dateRange.start.toISOString()));
    }
    if (dateRange.end) {
      const endOfDay = new Date(dateRange.end);
      endOfDay.setHours(23, 59, 59, 999);
      q = query(q, where('createdAt', '<=', endOfDay.toISOString()));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[]);
      setHasMore(snapshot.docs.length === limitCount);
      setLoading(false);
    }, (error) => {
      console.error('Failed to load delivery global orders:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [limitCount, dateRange]);

  const filtered = orders.filter((order) =>
    order.id.toLowerCase().includes(search.toLowerCase()) ||
    order.status?.toLowerCase().includes(search.toLowerCase()) ||
    order.currentWorkflowLabel?.toLowerCase().includes(search.toLowerCase()) ||
    order.customerSnapshot?.name?.toLowerCase().includes(search.toLowerCase()) ||
    order.customerSnapshot?.phone?.toLowerCase().includes(search.toLowerCase())
  );

  const currentDeliveryLabel = profile?.role === 'DELIVERY'
    ? 'Your Delivery Stage'
    : 'Delivery Stage';

  return (
    <RoleGuard allowedRoles={['DELIVERY', 'ADMIN', 'MANAGER']} redirectTo="/delivarypartner">
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
          <section id="global-orders" className="relative z-50 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 scroll-mt-28">
            <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded text-white">
              <ClipboardList size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-black text-slate-900 uppercase tracking-wider">Global Orders</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight opacity-70">Orders visible to delivery partner with assigned-stage filtering</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded border border-slate-200">
            {[
              { label: 'Total', value: stats.total, color: 'text-slate-600', icon: Package },
              { label: 'Active', value: stats.active, color: 'text-indigo-600', icon: Activity },
              { label: 'Done', value: stats.completed, color: 'text-emerald-600', icon: CheckCircle },
            ].map((item) => (
              <div key={item.label} className="bg-white px-4 py-1.5 rounded flex items-center gap-3 min-w-[100px] border border-slate-200/50 shadow-sm">
                <item.icon size={12} className={item.color} />
                <div className="leading-none">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{item.label}</p>
                  <p className={`text-[14px] font-black ${item.color}`}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="relative z-40 mb-6 flex gap-4">
          <div className="flex-1 relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              placeholder="Search by ID, Customer, Phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded px-10 py-2 text-[14px] font-bold text-slate-800 outline-none focus:border-indigo-600 transition-all shadow-sm"
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

        <div className="relative z-30 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
          <div className="bg-white/40 rounded-2xl border border-white/60 shadow-sm overflow-hidden backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Node ID</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Identity</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 min-w-[420px]">{currentDeliveryLabel}</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Workflow</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center tabular-nums">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Registry...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center tabular-nums">
                        <p className="text-[14px] font-bold text-slate-400 uppercase italic tracking-widest">No matching records found</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((order) => {
                      const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PLACED;
                      const amount = order.amounts?.grandTotal ?? (order as any).grandTotal ?? 0;

                      return (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 tabular-nums">
                            <div className="flex items-center gap-2">
                              <OrderThumbnail orderId={order.id} order={order as any} size="sm" />
                              <div>
                                <p className="text-[11px] font-black text-slate-900 leading-none mb-0.5 font-mono">#{order.id.replace('ORD-', '')}</p>
                                <p className="text-[9px] font-bold text-slate-400 tracking-tighter uppercase">{order.status}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <p className="text-[14px] font-bold text-slate-800 leading-none mb-0.5">{order.customerSnapshot?.name || 'Guest'}</p>
                            <p className="text-[10px] font-medium text-slate-400">{order.customerSnapshot?.phone || 'No phone'}</p>
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <WorkflowPipelineVisual
                              snapshot={order.workflowSnapshot}
                              orderId={order.id}
                              detailed={true}
                              filterByRoles={true}
                              allowNavigation={true}
                              className="max-w-full"
                            />
                            {((order.status === 'DELIVERED') || (order.workflow?.['deliveredAt']) || (order.currentWorkflowLabel === 'COMPLETED') || ((order.workflowSnapshot?.currentStepIndex ?? -1) >= (order.workflowSnapshot?.steps?.length ?? 0))) && (
                              <div className="mt-3 rounded-md bg-emerald-50 border border-emerald-100 p-3 text-emerald-700">
                                <p className="text-[15px] font-black">ORDER COMPLETED</p>
                                <p className="text-[14px]">All workflow stages are completed. No further actions are required.</p>
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
                          <td className="px-4 py-3 tabular-nums">
                            <div className="flex flex-col gap-1.5">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-tight ${cfg.color.split(' shadow')[0]}`}>
                                {React.cloneElement(cfg.icon as React.ReactElement, { size: 10 })}
                                {cfg.label}
                              </span>
                              <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">₹{amount.toLocaleString()}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            <Link
                              href={`/delivarypartner/orders/${order.id}`}
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
      </div>
    </RoleGuard>
  );
}
