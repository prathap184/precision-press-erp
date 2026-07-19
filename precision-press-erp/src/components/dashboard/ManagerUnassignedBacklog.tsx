'use client';

import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  limit,
  where,
  getDocs
} from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';
import { Order, UserProfile } from '@/types/models';
import { UserRole } from '@/types/auth';
import { filterUnassignedBacklog } from '@/lib/role-workflow-utils';
import { assignPrinter } from '@/lib/workflow';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { Loader2, UserPlus } from 'lucide-react';

interface ManagerUnassignedBacklogProps {
  role: UserRole;
  onOrdersUpdate?: (orders: Order[]) => void;
  maxHeight?: string;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}

export function ManagerUnassignedBacklog({ 
  role, 
  onOrdersUpdate,
  maxHeight = '160px',
  title = 'Unassigned Backlog',
  subtitle = 'Orders waiting for manager assignment',
  emptyMessage = 'All assigned.'
}: ManagerUnassignedBacklogProps) {
  const [unassignedOrders, setUnassignedOrders] = useState<Order[]>([]);
  const [printers, setPrinters] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch printers once
  useEffect(() => {
    const fetchPrinters = async () => {
      const q = query(collection(db, 'profiles'), where('role', '==', 'PRINTER'), limit(50));
      const snap = await getDocs(q);
      setPrinters(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    };
    fetchPrinters();
  }, []);

  // Listen to all orders
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      
      // For manager, filter for ACCOUNTANT_APPROVED status (orders waiting for manager's step)
      const filtered = allOrders.filter(order => order.status === 'ACCOUNTANT_APPROVED');
      setUnassignedOrders(filtered);
      onOrdersUpdate?.(filtered);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [role, onOrdersUpdate]);

  const handleAssign = async (orderId: string, printerId: string) => {
    if (!printerId) return;
    setProcessingId(orderId);
    try {
      await assignPrinter(orderId, printerId);
    } catch (error) {
      console.error('Assignment failed:', error);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm flex flex-col">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
        <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
          {title}
        </h3>
        <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mt-0.5">
          {subtitle}
        </p>
      </div>
      
      {loading ? (
        <div className="flex justify-center p-2 flex-1 items-center">
          <Loader2 className="animate-spin text-slate-400 h-3 w-3" />
        </div>
      ) : unassignedOrders.length === 0 ? (
        <div className="p-2 text-center text-slate-500 font-bold text-[9px] flex-1 flex items-center justify-center uppercase tracking-wider">
          {emptyMessage}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 flex-1 overflow-y-auto" style={{ maxHeight }}>
          {unassignedOrders.map((order) => (
            <div key={order.id} className="flex items-center gap-1.5 px-2 py-1.5">
              <div className="w-6 h-6 rounded bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                <OrderThumbnail orderId={order.id} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <h4 className="text-[9px] font-bold text-slate-800 truncate">
                    {order.customerSnapshot?.displayName || order.customerSnapshot?.name}
                  </h4>
                  <span className="text-[8px] font-bold bg-slate-100 text-slate-700 px-1 py-0.25 rounded border border-slate-200 shrink-0 whitespace-nowrap ml-1">
                    ₹{order.amounts?.grandTotal?.toLocaleString()}
                  </span>
                </div>
                <p className="text-[8px] text-slate-500 truncate">#{order.id.slice(-6)}</p>
                <div className="flex gap-1 items-center mt-0.5">
                  <select 
                    disabled={processingId === order.id}
                    onChange={(e) => handleAssign(order.id, e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded px-1 py-0.5 text-[7px] text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <option value="">Assign...</option>
                    {printers.map(p => (
                      <option key={p.uid} value={p.uid}>{p.displayName || p.name}</option>
                    ))}
                  </select>
                  {processingId === order.id && (
                    <Loader2 className="animate-spin text-indigo-500 h-2 w-2 flex-shrink-0" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

