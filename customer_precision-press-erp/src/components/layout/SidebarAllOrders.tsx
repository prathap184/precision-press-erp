'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import Link from 'next/link';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { Layers, ArrowRight } from 'lucide-react';

interface SidebarAllOrdersProps {
  userId: string;
}

export const SidebarAllOrders = ({ userId }: SidebarAllOrdersProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    // Fetch last 5 orders regardless of status
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[]);
      setLoading(false);
    }, (err) => {
      console.error("Sidebar recent orders error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [userId]);

  if (loading || orders.length === 0) return null;

  return (
    <div className="px-4 mt-10 animate-in fade-in slide-in-from-left-4 duration-1000">
      <div className="flex items-center justify-between px-5 mb-4 border-b border-slate-200/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.25em]">All Orders</p>
        </div>
        <Link href="/dashboard/orders" className="text-blue-500 hover:text-blue-700 transition-colors">
          <Layers size={14} />
        </Link>
      </div>
      
      <div className="space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/dashboard/orders/${order.id}`}
            className="flex items-center gap-4 p-4 rounded-[1.5rem] bg-white border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all group"
          >
            <div className="flex-shrink-0">
              <OrderThumbnail order={order} size="sm" className="rounded-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between items-start mb-0.5">
                <p className="text-[11px] font-black text-slate-900 truncate tracking-tight">#{order.id.slice(-6).toUpperCase()}</p>
                <p className="text-[9px] font-black text-slate-400">₹{(order.amounts?.grandTotal || 0).toLocaleString()}</p>
              </div>
              <p className="text-[8px] font-black text-blue-600 uppercase tracking-tighter truncate opacity-70">
                {order.status.replace(/_/g, ' ')}
              </p>
            </div>
            <ArrowRight size={12} className="text-slate-300 group-hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
      
      <Link 
        href="/dashboard/orders"
        className="flex items-center justify-center gap-2 mt-6 py-4 px-5 rounded-[1.5rem] bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all group"
      >
        Complete Order History
        <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
      </Link>
    </div>
  );
};

