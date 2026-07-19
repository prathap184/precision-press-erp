'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { 
  Package, 
  Truck, 
  MapPin, 
  Clock, 
  ArrowRight,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { DatabaseService } from '@/services/db';
import { dispatchOrder } from '@/lib/workflow';
import { Order } from '@/types/models';
import { useAuth } from '@/lib/auth-context';

export default function DispatchPage() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    // Listen to all orders for simplicity in MVP
    const unsubscribe = DatabaseService.listenToOrders((data) => {
      setOrders(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDispatch = async (orderId: string) => {
    if (!profile) return;
    setActionLoading(orderId);
    try {
      const result = await dispatchOrder(orderId, {
        method: 'PICKUP'
      });
      if (!result.success) throw new Error('Action failed');
    } catch (error) {
      console.error("Dispatch failed:", error);
      alert("Failed to update dispatch status.");
    } finally {
      setActionLoading(null);
    }
  };

  const readyToDispatch = orders.filter((o: Order) => o.status === 'COMPLETED');
  const enRoute = orders.filter((o: Order) => o.status === 'DISPATCHED');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-700">
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-3 py-2.5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Dispatch Management</h3>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
              Final verification and logistics handover.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="bg-amber-50 px-2 py-1 rounded text-[10px] font-bold text-amber-700 flex items-center gap-1 border border-amber-100">
              <Package size={12} /> {readyToDispatch.length} Ready
            </div>
            <div className="bg-blue-50 px-2 py-1 rounded text-[10px] font-bold text-blue-700 flex items-center gap-1 border border-blue-100">
              <Truck size={12} /> {enRoute.length} Dispatched
            </div>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {readyToDispatch.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-200 rounded bg-slate-50">
              <div className="inline-flex p-2 rounded-full bg-slate-200 text-slate-400 mb-2">
                <Package size={16} strokeWidth={1.5} />
              </div>
              <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">No orders pending dispatch.</p>
            </div>
          ) : (
            readyToDispatch.map((order) => (
              <div 
                key={order.id} 
                className="group bg-white border border-slate-200 hover:border-slate-300 p-2 rounded flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
                    <Package size={14} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-slate-800 text-xs">ORD-{order.id.slice(-4)}</p>
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {order.paymentMethod === 'CREDIT' ? 'CREDIT' : 'CASH'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium">{order.customerName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                      <MapPin size={10} />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Destination</span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-700">Mysuru Local</p>
                  </div>

                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                      <Clock size={10} />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Status</span>
                    </div>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-tight">Ready</p>
                  </div>

                  <button 
                    onClick={() => handleDispatch(order.id)}
                    disabled={actionLoading === order.id}
                    className="bg-slate-800 text-white px-3 py-1.5 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === order.id ? <Loader2 className="animate-spin" size={12} /> : 'DISPATCH'} <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
          
          {enRoute.length > 0 && (
            <div className="pt-3 mt-3 border-t border-slate-100">
              <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Recently Dispatched</h4>
              <div className="space-y-1">
                {enRoute.slice(0, 3).map((order) => (
                  <div key={order.id} className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded text-slate-500">
                    <div className="flex items-center gap-2">
                      <Truck size={12} className="text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-600">ORD-{order.id.slice(-4)}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{order.customerName}</span>
                    </div>
                    <div className="flex items-center gap-1 text-blue-600 text-[10px] font-bold">
                      <CheckCircle size={12} /> Handed Over
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
