'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import Link from 'next/link';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { Loader2, ArrowRight } from 'lucide-react';

interface SidebarActiveOrdersProps {
  userId: string;
}

export const SidebarActiveOrders = ({ userId }: SidebarActiveOrdersProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    // Fetch last 3 active orders
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', userId),
      where('status', 'not-in', ['COMPLETED', 'DISPATCHED', 'DELIVERED', 'CANCELLED']),
      orderBy('status'), // This is needed because of inequality filter on status
      orderBy('createdAt', 'desc'),
      limit(3)
    );

    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[]);
      setLoading(false);
    }, (err) => {
      console.error("Sidebar tracking error:", err);
      // Fallback: just get latest 3 regardless of status if index is missing
      const fallbackQ = query(
        collection(db, 'orders'),
        where('customerId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(3)
      );
      onSnapshot(fallbackQ, (s) => {
        setOrders(s.docs.map(d => ({ id: d.id, ...d.data() })) as Order[]);
        setLoading(false);
      });
    });

    return () => unsub();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) return null;

  return (
    <div className="px-4 mt-8 animate-in fade-in slide-in-from-left-4 duration-1000">
      <div className="flex items-center justify-between px-5 mb-4">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">Live Tracking</p>
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      </div>
      
      <div className="space-y-2">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/dashboard/orders/${order.id}`}
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white hover:shadow-sm ring-1 ring-transparent hover:ring-slate-200/50 transition-all group"
          >
            <div className="flex-shrink-0">
              <OrderThumbnail order={order} size="sm" className="rounded-xl border-none shadow-none" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black text-slate-900 truncate">#{order.id.replace('ORD-', '')}</p>
              <p className="text-[8px] font-black text-blue-600 uppercase tracking-tighter truncate opacity-70 group-hover:opacity-100 transition-opacity">
                {order.status.replace(/_/g, ' ')}
              </p>
            </div>
            <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
          </Link>
        ))}
      </div>
      
      <Link 
        href="/dashboard/orders"
        className="block mt-4 px-5 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:underline"
      >
        View All Orders →
      </Link>
    </div>
  );
};

