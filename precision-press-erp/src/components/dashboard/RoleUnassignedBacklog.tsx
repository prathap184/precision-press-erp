'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  limit
} from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';
import { Order } from '@/types/models';
import { UserRole } from '@/types/auth';
import { filterUnassignedBacklog } from '@/lib/role-workflow-utils';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { Loader2, ArrowUpRight, Check, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

interface RoleUnassignedBacklogProps {
  role: UserRole;
  printerCategory?: string;
  onOrdersUpdate?: (orders: Order[]) => void;
  maxHeight?: string;
  orderHrefBuilder?: (order: Order) => string;
}

export function RoleUnassignedBacklog({ 
  role, 
  printerCategory,
  onOrdersUpdate,
  maxHeight = '160px',
  orderHrefBuilder
}: RoleUnassignedBacklogProps) {
  const [unassignedOrders, setUnassignedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Listen to all orders
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      
      // Filter for this role's unassigned backlog
      const filtered = filterUnassignedBacklog(allOrders, role, printerCategory);
      setUnassignedOrders(filtered);
      onOrdersUpdate?.(filtered);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [role, printerCategory, onOrdersUpdate]);

  const formatDate = (value: unknown) => {
    if (!value) return '—';
    try {
      const maybeTimestamp = value as { seconds?: number };
      const date = maybeTimestamp?.seconds ? new Date(maybeTimestamp.seconds * 1000) : new Date(value as string);
      if (isNaN(date.getTime())) return '—';
      return format(date, 'dd MMM yyyy, hh:mm a');
    } catch {
      return '—';
    }
  };

  const getProofHref = (order: Order) => {
    return order.workflow?.customerDesignUrl || order.workflow?.designUrl || order.thumbnailUrl || null;
  };

  const handleAccept = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      // Import the action dynamically to avoid circular dependencies
      const { startWorkflowStep } = await import('@/lib/workflow');
      await startWorkflowStep(orderId);
      // Data will automatically update via the listener
    } catch (error) {
      console.error('Failed to accept order:', error);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.25em]">
          Unassigned Backlog
        </h3>
        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">
          Awaiting acceptance
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center p-8 flex-1 items-center">
          <Loader2 className="animate-spin text-slate-400 h-5 w-5" />
        </div>
      ) : unassignedOrders.length === 0 ? (
        <div className="p-8 text-center text-slate-500 font-bold text-[10px] flex-1 flex items-center justify-center uppercase tracking-wider">
          All assigned.
        </div>
      ) : (
        <div className="flex-1 overflow-auto" style={{ maxHeight: maxHeight === 'none' ? undefined : maxHeight }}>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID / Date</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Job Ref</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mode / Ref</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proof</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {unassignedOrders.map((order) => {
                const proofHref = getProofHref(order);
                return (
                  <tr
                    key={order.id}
                    className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors ${orderHrefBuilder ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      const href = orderHrefBuilder?.(order);
                      if (href) router.push(href);
                    }}
                  >
                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                          <OrderThumbnail orderId={order.id} />
                        </div>
                        <div>
                          <p className="text-[11px] font-black text-blue-600 uppercase tracking-tight leading-none">
                            {order.id.slice(0, 3)}-{order.id.slice(-6)}
                          </p>
                          <p className="text-[9px] text-slate-400 font-bold mt-1">
                            {formatDate(order.createdAt)}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{order.id}</p>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                          <Eye size={12} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">
                            {order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Direct Client'}
                          </p>
                          <p className="text-[9px] text-slate-400 uppercase tracking-widest">
                            {order.customerSnapshot?.phone || order.customerSnapshot?.email || 'No contact'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <p className="text-sm font-black text-slate-900">₹{(order.amounts?.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${order.orderType === 'CREDIT' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {order.orderType}
                        </span>
                        <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                          {order.paymentMethod || '—'}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      {proofHref ? (
                        <Link
                          href={proofHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-black uppercase tracking-wider hover:bg-blue-100 transition-colors"
                        >
                          Link <ArrowUpRight size={12} />
                        </Link>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 align-middle tabular-nums">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          disabled={processingId === order.id}
                          onClick={(e) => { e.stopPropagation(); handleAccept(order.id); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          {processingId === order.id ? <Loader2 className="animate-spin" size={12} /> : <Check size={12} />}
                          {processingId === order.id ? '...' : 'Accept'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

