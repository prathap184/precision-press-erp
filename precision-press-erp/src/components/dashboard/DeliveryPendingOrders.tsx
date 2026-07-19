'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, limit, onSnapshot, orderBy, query } from '@/lib/supabase-firestore-shim';
import { ArrowRight, ClipboardList, Loader2, Search, Truck } from 'lucide-react';
import { db } from '@/lib/firebase';
import { RoleGuard } from '@/lib/role-guard';
import { Order } from '@/types/models';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';

function findDeliveryStep(order: Order) {
  return order.workflowSnapshot?.steps?.find((step) => step.role === 'DELIVERY');
}

function isPendingDelivery(order: Order) {
  if (order.status === 'DELIVERED') return false;
  const deliveryStep = findDeliveryStep(order);
  if ((deliveryStep?.status as any) === 'COMPLETED' || deliveryStep?.completedAt) return false;

  return Boolean(
    order.currentWorkflowRole === 'DELIVERY' ||
    order.status === 'DISPATCHED' ||
    order.status === 'IN_TRANSIT' ||
    (deliveryStep && (deliveryStep.status as any) !== 'COMPLETED')
  );
}

export function DeliveryPendingOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [limitCount, setLimitCount] = useState(100);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Order[]);
      setHasMore(snapshot.docs.length === limitCount);
      setLoading(false);
    }, (error) => {
      console.error('Failed to load pending delivery orders:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [limitCount]);

  const pending = useMemo(() => orders.filter(isPendingDelivery), [orders]);

  const filtered = pending.filter((order) => {
    const deliveryStep = findDeliveryStep(order);
    return (
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.customerSnapshot?.name?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerSnapshot?.phone?.toLowerCase().includes(search.toLowerCase()) ||
      order.status?.toLowerCase().includes(search.toLowerCase()) ||
      deliveryStep?.label?.toLowerCase().includes(search.toLowerCase()) ||
      deliveryStep?.status?.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <RoleGuard allowedRoles={['DELIVERY', 'ADMIN', 'MANAGER']} redirectTo="/delivarypartner">
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-4 bg-white py-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 rounded text-white">
              <Truck size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-black text-slate-900 uppercase tracking-wider">Pending Deliveries</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight opacity-70">Orders waiting to be delivered to customers</p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded border border-slate-200">
            <div className="bg-white px-4 py-1.5 rounded flex items-center gap-3 min-w-[120px] border border-slate-200/50 shadow-sm">
              <ClipboardList size={12} className="text-slate-600" />
              <div className="leading-none">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Pending</p>
                <p className="text-[14px] font-black text-amber-600">{pending.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 flex gap-4">
          <div className="flex-1 relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-600 transition-colors" />
            <input
              type="text"
              placeholder="Search pending orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded px-10 py-2 text-[14px] font-bold text-slate-800 outline-none focus:border-amber-600 transition-all shadow-sm"
            />
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
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 min-w-[420px]">Delivery Stage</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center tabular-nums">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Loading pending orders...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center tabular-nums">
                        <p className="text-[14px] font-bold text-slate-400 uppercase italic tracking-widest">No pending orders found</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((order) => {
                      const deliveryStep = findDeliveryStep(order);

                      return (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 tabular-nums">
                            <div className="flex items-center gap-2">
                              <OrderThumbnail orderId={order.id} order={order as any} size="sm" />
                              <div>
                                <p className="text-[11px] font-black text-slate-900 leading-none mb-0.5 font-mono">#{order.id.replace('ORD-', '')}</p>
                                <p className="text-[9px] font-bold text-amber-500 tracking-tighter uppercase">PENDING</p>
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
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{deliveryStep?.status || 'COMPLETED'}</p>
                            <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">{deliveryStep?.label || 'Delivery'}</p>
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
                  onClick={() => setLimitCount((prev) => prev + 100)}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-amber-600 transition-colors flex items-center gap-2"
                >
                  Load More Pending Orders <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </RoleGuard>
  );
}
