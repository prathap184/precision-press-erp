'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { 
  Headphones, 
  Users, 
  ShoppingCart, 
  Search, 
  Clock, 
  Plus, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  ExternalLink,
  MessageCircle,
  TrendingUp,
  UserCheck,
  LayoutGrid
} from 'lucide-react';
import { StaffRoleSwitcher } from '@/components/dashboard/StaffRoleSwitcher';
import { StaffRole } from '@/types/roles';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit 
} from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import { STATUS_LABELS } from '@/types/workflow';
import Link from 'next/link';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';

export default function SupportTeamDashboard() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Support follows all orders to assist customers
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error('[onSnapshot] Support orders listener failed:', error);
      setLoading(false);
    });

    // Listen for system anomalies
    const anomalyQ = query(
      collection(db, 'anomalies'),
      orderBy('timestamp', 'desc'),
      limit(5)
    );

    const unsubAnomalies = onSnapshot(anomalyQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnomalies(data);
    }, (error) => {
      console.error('[onSnapshot] Anomaly listener failed:', error);
    });

    return () => {
      unsub();
      unsubAnomalies();
    };
  }, []);

  const filteredOrders = orders.filter(o => 
    o.id.toLowerCase().includes(search.toLowerCase()) || 
    (o.customerSnapshot?.displayName || o.customerSnapshot?.name || "")?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={['SUPPORT', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']}>
      <div className="space-y-6 animate-in fade-in duration-1000">
        <StaffRoleSwitcher userRoles={(profile?.roles as StaffRole[]) || []} />
        
        {/* Editorial Header */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-3 rounded border border-slate-200 gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-indigo-600 mb-0.5">
               <Headphones size={12} />
               <span className="text-[9px] font-bold uppercase tracking-widest">Operations Hub</span>
            </div>
            <h1 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Support Console</h1>
            <p className="text-[10px] text-slate-500 mt-0.5 max-w-xl font-medium">
              Monitor active jobs and perform identity-based proxy actions for customers.
            </p>
          </div>

          <Link 
            href="/proxy-order"
            className="bg-indigo-600 text-white px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all flex items-center gap-1 whitespace-nowrap shadow-sm"
          >
            <Plus size={11} />
            Proxy Order
          </Link>
        </section>

        {/* Quick Insights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Assisting Users', value: '12', icon: UserCheck, color: 'text-blue-600' },
            { label: 'Active Streams', value: orders.length, icon: TrendingUp, color: 'text-indigo-600' },
            { label: 'Urgent Tickets', value: orders.filter(o => o.status === 'PAYMENT_PENDING').length, icon: AlertCircle, color: 'text-amber-600' },
            { label: 'Resolved (24h)', value: '42', icon: CheckCircle, color: 'text-emerald-600' },
          ].map((insight, i) => (
            <div key={i} className="bg-white p-2.5 rounded border border-slate-200 flex items-center justify-between">
               <div>
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{insight.label}</p>
                 <h3 className="text-base font-bold text-slate-800">{insight.value}</h3>
               </div>
               <div className={`p-1.5 rounded bg-slate-50 border border-slate-100 ${insight.color}`}>
                  <insight.icon size={14} />
               </div>
            </div>
          ))}
        </div>

        {/* Anomaly Monitor */}
        {anomalies.length > 0 && (
          <section className="bg-red-50 border border-red-200 rounded p-3">
            <div className="flex items-center gap-1.5 text-red-700 mb-2">
              <AlertCircle size={12} />
              <h2 className="text-[10px] font-bold uppercase tracking-wider">Critical Anomalies Detected</h2>
            </div>
            <div className="space-y-1.5">
              {anomalies.map((anomaly) => (
                <div key={anomaly.id} className="bg-white border border-red-100 p-2 rounded flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-800">{anomaly.type || 'System Anomaly'}</p>
                      <p className="text-[9px] text-slate-500 max-w-xl">{anomaly.message || 'Unexpected state detected in automated processing pipeline.'}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-bold text-slate-500">{new Date(anomaly.timestamp?.seconds * 1000).toLocaleTimeString()}</p>
                    <Link href={`/admin/logs?id=${anomaly.id}`} className="text-[9px] font-bold text-red-600 hover:underline mt-0.5 block">Inspect</Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live Order Monitor */}
        <div className="bg-white rounded border border-slate-200">
          <div className="px-3 py-2 flex flex-col sm:flex-row justify-between items-center gap-2 border-b border-slate-200 bg-slate-50">
            <div>
               <h2 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Job Surveillance</h2>
               <p className="text-[9px] text-slate-500 mt-0.5">Live Order Stream Across All Entities</p>
            </div>
            
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
              <input 
                type="text" 
                placeholder="Search Client or Order ID..."
                className="w-full bg-white border border-slate-200 rounded pl-8 pr-2 py-1 text-[10px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500">
                 <Loader2 className="animate-spin" size={20} />
                 <p className="text-[10px] font-bold uppercase tracking-wider">Syncing Production Data...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">No surveillance data matches your query</div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    <th className="px-3 py-2">Identity</th>
                    <th className="px-3 py-2">Transaction</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 tabular-nums">
                         <div className="flex items-center gap-2">
                            <OrderThumbnail order={order} size="sm" />
                            <div>
                               <p className="text-[10px] font-bold text-slate-800">{order.customerSnapshot?.name || 'Unknown'}</p>
                               <p className="text-[9px] text-slate-500">{order.customerSnapshot?.phone || 'No Mobile'}</p>
                            </div>
                         </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                         <div>
                            <p className="text-[10px] font-mono font-bold text-indigo-600">{order.id}</p>
                            <p className="text-[9px] text-slate-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                         </div>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                         <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                           order.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                           order.status === 'CANCELLED' ? 'bg-red-100 text-red-700 border border-red-200' :
                           'bg-slate-100 text-slate-700 border border-slate-200'
                         }`}>
                          {STATUS_LABELS[order.status]}
                         </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                         <Link 
                           href={`/customer/orders/${order.id}/view`}
                           className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                         >
                           Inspect <ExternalLink size={10} />
                         </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Global Directory Shortcut */}
        <div className="bg-slate-800 rounded border border-slate-700 overflow-hidden">
          <Link 
            href="/manager/customers"
            className="flex flex-col md:flex-row justify-between items-center gap-3 p-4 hover:bg-slate-700 transition-colors"
          >
             <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Users size={14} className="text-indigo-400" />
                  Access Global Identity Directory
                </h3>
                <p className="text-slate-400 text-[10px]">Provision accounts, adjust credit limits, and verify security protocols.</p>
             </div>
             <div className="bg-indigo-600 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0">
               Open Directory
             </div>
          </Link>
        </div>

      </div>
    </RoleGuard>
  );
}


