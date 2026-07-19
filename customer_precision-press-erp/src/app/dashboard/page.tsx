'use client';


import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { RoleGuard } from '@/lib/role-guard';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight,
  ShoppingCart,
  Clock,
  Wallet,
  BookOpen,
  LayoutGrid,
  Settings,
  Package,
  Activity,
  ArrowRight,
  Globe,
  Headphones,
  Store
} from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';


export default function CustomerDashboard() {
  const { profile } = useAuth();
  const { effectiveUserId, isImpersonating, simulatedUser } = useEffectiveUser(profile?.uid);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    active: 0
  });

  useEffect(() => {
    if (!effectiveUserId) return;

    // Listen to recent orders
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', effectiveUserId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      
      setOrders(ordersData);
      
      // Calculate Stats
      const total = ordersData.length;
      const pending = ordersData.filter(o => o.status === 'PLACED' || o.paymentStatus === 'PENDING').length;
      const active = ordersData.filter(o => !['COMPLETED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(o.status)).length;
      
      setStats({ total, pending, active });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveUserId]);

  // Map status to progress percentage for the UI
  const getStatusProgress = (status: string) => {
    switch (status) {
      case 'PLACED': return 10;
      case 'DESIGNING': return 30;
      case 'DESIGN_READY': return 45;
      case 'PAYMENT_PENDING': return 50;
      case 'PAYMENT_VERIFIED': return 60;
      case 'ASSIGNED': return 70;
      case 'IN_PROGRESS': return 85;
      case 'COMPLETED': return 100;
      case 'DISPATCHED': return 100;
      case 'DELIVERED': return 100;
      default: return 5;
    }
  };

  const getSourceDisplay = (source?: string) => {
    switch (source) {
      case 'WEB': return { label: 'Online Portal', icon: Globe };
      case 'SUPPORT': return { label: 'Support Team', icon: Headphones };
      case 'COUNTER': return { label: 'Store Walk-in', icon: Store };
      default: return { label: 'Custom Print Job', icon: BookOpen };
    }
  };

  const activeJobs = orders.filter(o => !['COMPLETED', 'DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(o.status)).slice(0, 3);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-12">
        {/* Welcome Header */}
        <section className="flex justify-between items-end gap-4">
          <div>
            <p className="text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-2">Command Center</p>
            <h1 className="text-[28px] font-black font-display text-primary tracking-tighter">
              Dashboard
            </h1>
            <p className="text-on-surface-variant font-medium mt-1 max-w-lg opacity-60 text-[20px]">
              Welcome back, {profile?.name?.split(' ')[0] || 'Partner'}. Manage your fleet of print jobs.
            </p>
          </div>
          <Link 
            href="/dashboard/orders/new" 
            className="bg-primary text-white rounded-2xl py-3 px-6 flex items-center justify-center gap-2.5 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95"
          >
            <div className="bg-white/20 p-1 rounded-lg">
              <Plus size={14} strokeWidth={4} />
            </div>
            <span>New Print Job</span>
          </Link>
        </section>

        {/* Summary Stats - Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Browse Products */}
          <Link href="/dashboard/categories" className="bg-surface-container-lowest p-6 rounded-[2rem] shadow-[0px_20px_40px_rgba(0,35,111,0.03)] border-b-4 border-transparent hover:border-indigo-500 transition-all group block text-left">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-primary-fixed w-12 h-12 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Search size={20} />
              </div>
              <span className="text-secondary font-black text-[9px] bg-secondary-container px-2.5 py-1 rounded-full uppercase tracking-widest group-hover:underline">Catalog</span>
            </div>
            <p className="text-on-surface-variant text-[10px] font-black tracking-[0.2em] uppercase mb-1 opacity-40">Explore</p>
            <h3 className="text-[28px] font-black font-display text-primary tracking-tighter flex items-center gap-2 group-hover:translate-x-2 transition-transform">
              Browse Products
            </h3>
          </Link>

          {/* Total Orders */}
          <div className="bg-surface-container-lowest p-6 rounded-[2rem] shadow-[0px_20px_40px_rgba(0,35,111,0.03)] border-b-4 border-transparent hover:border-indigo-500 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-primary-fixed w-12 h-12 rounded-2xl flex items-center justify-center text-primary">
                <ShoppingCart size={20} />
              </div>
              <span className="text-secondary font-black text-[9px] bg-secondary-container px-2.5 py-1 rounded-full uppercase tracking-widest">Lifetime</span>
            </div>
            <p className="text-on-surface-variant text-[10px] font-black tracking-[0.2em] uppercase mb-1 opacity-40">Orders Tracked</p>
            <h3 className="text-3xl font-black font-display text-primary tracking-tighter">
              {orders.length > 0 ? orders.length : '—'}
            </h3>
          </div>

          {/* Pending Orders */}
          <div className="bg-surface-container-lowest p-6 rounded-[2rem] shadow-[0px_20px_40px_rgba(0,35,111,0.03)] border-b-4 border-transparent hover:border-indigo-500 transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-tertiary-fixed w-12 h-12 rounded-2xl flex items-center justify-center text-tertiary">
                <Clock size={20} />
              </div>
              <span className="text-on-surface-variant font-black text-[9px] bg-surface-container-high px-2.5 py-1 rounded-full uppercase tracking-widest">Active</span>
            </div>
            <p className="text-on-surface-variant text-[10px] font-black tracking-[0.2em] uppercase mb-1 opacity-40">Pending & Active</p>
            <h3 className="text-3xl font-black font-display text-primary tracking-tighter">
               {stats.active}
            </h3>
          </div>

          {/* Account Balance */}
          <Link href="/dashboard/ledger" className="bg-surface-container-lowest p-6 rounded-[2rem] shadow-[0px_20px_40px_rgba(0,35,111,0.03)] border-b-4 border-transparent hover:border-indigo-500 transition-all group block text-left">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-secondary-container w-12 h-12 rounded-2xl flex items-center justify-center text-secondary">
                <Wallet size={20} />
              </div>
              <span className="text-secondary hover:underline text-[9px] font-black uppercase tracking-widest">Open Ledger</span>
            </div>
            <p className="text-on-surface-variant text-[10px] font-black tracking-[0.2em] uppercase mb-1 opacity-40">
              {profile?.customerType === 'CREDIT' ? 'Usage Credit' : 'Account Status'}
            </p>
            <h3 className="text-3xl font-black font-display text-primary tracking-tighter italic">
              {profile?.customerType === 'CREDIT' 
                ? `₹${((profile.creditLimit || 0) - (profile.usedCredit || 0)).toLocaleString()}` 
                : profile?.status || 'ACTIVE'}
            </h3>
          </Link>
        </div>

        {/* Quick Actions Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
           {[
             { label: 'Ledger', href: '/dashboard/ledger', icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50' },
             { label: 'Payment', href: '/dashboard/payment', icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-50' },
             { label: 'Price List', href: '/dashboard/pricelist', icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-50' },
               { label: 'Multi Order', href: '/dashboard/multi-order', icon: ShoppingCart, color: 'text-slate-500', bg: 'bg-slate-50' },
             { label: 'Wishlist', href: '/dashboard/wishlist', icon: LayoutGrid, roles: ['CUSTOMER'], color: 'text-rose-500', bg: 'bg-rose-50' },
             { label: 'Membership', href: '/dashboard/membership', icon: Settings, color: 'text-amber-500', bg: 'bg-amber-50' },
             { label: 'My Orders', href: '/dashboard/orders', icon: Package, color: 'text-slate-500', bg: 'bg-slate-50' },
           ].map(action => (
             <Link 
               key={action.label} 
               href={action.href}
               className="bg-white p-4 rounded-[1.5rem] border border-slate-100 flex flex-col items-center justify-center text-center gap-2.5 hover:shadow-xl hover:translate-y-[-4px] transition-all group"
             >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${action.bg} ${action.color} group-hover:scale-110 transition-transform`}>
                   <action.icon size={18} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-900 transition-colors">{action.label}</span>
             </Link>
           ))}
        </section>

        {/* Recent Orders Table */}
        <div className="bg-surface-container-lowest rounded-[2rem] shadow-[0px_30px_60px_rgba(0,35,111,0.04)] overflow-hidden border border-surface-container-low">
          <div className="p-6 flex justify-between items-center bg-white border-b border-surface-container-low">
            <div>
              <h4 className="text-lg font-black font-display text-primary tracking-tight">Recent Orders</h4>
              <p className="text-xs text-on-surface-variant/40 font-bold uppercase tracking-widest mt-1">Live Transaction Stream</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant/30 uppercase tracking-[0.3em]">ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant/30 uppercase tracking-[0.3em]">Details</th>
                  <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant/30 uppercase tracking-[0.3em]">Date</th>
                  <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant/30 uppercase tracking-[0.3em]">Amount</th>
                  <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant/30 uppercase tracking-[0.3em]">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-on-surface-variant/30 uppercase tracking-[0.3em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low">
                {orders.slice(0, 4).map((order) => {
                  const sourceInfo = getSourceDisplay(order.orderSource);
                  return (
                    <tr key={order.id} className="hover:bg-surface-container-low/20 transition-colors group">
                    <td className="px-6 py-5 tabular-nums">
                      <span className="text-sm font-black font-display text-primary tracking-tight">{order.id.replace('ORD-', '')}</span>
                    </td>
                    <td className="px-6 py-5 tabular-nums">
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center text-primary/40 group-hover:bg-primary group-hover:text-white transition-all">
                          <sourceInfo.icon size={16} />
                        </div>
                        <span className="text-sm font-bold text-on-surface tracking-tight">
                          {sourceInfo.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm text-on-surface-variant/60 font-medium tracking-tight tabular-nums">
                      {order.createdAt?.seconds ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(order.createdAt.seconds * 1000)) : '—'}
                    </td>
                    <td className="px-6 py-5 text-sm font-black text-primary tracking-tight tabular-nums">
                      ₹{order.amounts?.grandTotal?.toLocaleString() || order.grandTotal?.toLocaleString() || '0'}
                    </td>
                    <td className="px-6 py-5 tabular-nums">
                      <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] border ${
                        order.status === 'COMPLETED' || order.status === 'DISPATCHED' ? 'bg-secondary-container/20 text-secondary border-secondary/20' :
                        ['DESIGNING', 'IN_PROGRESS', 'ASSIGNED'].includes(order.status) ? 'bg-tertiary-container/20 text-tertiary border-tertiary/20' :
                        order.status === 'PAYMENT_PENDING' ? 'bg-error-container/20 text-error border-error/20' :
                        'bg-surface-container-high/50 text-on-surface-variant border-surface-container-high'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right tabular-nums">
                      <Link href={`/dashboard/orders/${order.id}`} className="p-2.5 hover:bg-surface-container-high rounded-xl transition-all text-on-surface-variant/30 hover:text-primary inline-block">
                        <MoreVertical size={16} />
                      </Link>
                    </td>
                  </tr>
                )})}
                {orders.length === 0 && !loading && (
                    <tr>
                        <td colSpan={6} className="px-6 py-14 text-center opacity-40 font-black uppercase tracking-widest tabular-nums">No Recent Orders Found</td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Grid: Real-time Queue & Promotional */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Real-time Queue */}
          <div className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <div>
                <h4 className="text-lg font-black font-display text-primary tracking-tight">Active Production</h4>
                <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest mt-1">Live Engine Status</p>
              </div>
              <span className="text-[9px] font-black text-secondary uppercase tracking-[0.3em] px-3 py-1.5 bg-secondary-container/30 rounded-full border border-secondary/10 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                Live Sync Active
              </span>
            </div>
            
            <div className="space-y-4">
              {activeJobs.map((job) => (
                <div key={job.id} className="bg-surface-container-lowest p-4 rounded-[1.5rem] shadow-sm border border-surface-container-low hover:border-secondary transition-all group flex items-center gap-4">
                  <div className="w-12 h-12 bg-surface-container-low rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Activity size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline mb-3">
                      <h5 className="text-sm font-black text-primary tracking-tight">Order #{job.id.replace('ORD-', '')} — {job.status}</h5>
                      <span className="text-xs font-black text-secondary">{getStatusProgress(job.status)}%</span>
                    </div>
                    <div className="w-full bg-surface-container-low h-2 rounded-full overflow-hidden border border-surface-container-low">
                      <div className="bg-secondary h-full transition-all duration-1000 ease-out" style={{ width: `${getStatusProgress(job.status)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              
              {activeJobs.length === 0 && (
                  <div className="bg-surface-container-low/30 p-6 rounded-[1.5rem] border border-dashed border-on-surface-variant/20 flex items-center justify-center group cursor-pointer hover:bg-white hover:border-secondary transition-all">
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center mx-auto mb-2.5 text-on-surface-variant/20 group-hover:text-secondary group-hover:scale-110 transition-all">
                        <Package size={18} />
                      </div>
                      <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest">No Jobs in Production</p>
                    </div>
                  </div>
              )}
            </div>
          </div>

          {/* Promo Card */}
          <div className="relative h-full min-h-[320px] rounded-[2.5rem] overflow-hidden group shadow-2xl shadow-primary/10">
            <img 
              src="https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&q=80&w=2070" 
              alt="Nanographic Tech" 
              className="absolute inset-0 w-full h-full object-cover grayscale brightness-50 group-hover:scale-105 transition-transform duration-1000"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/40 to-transparent p-8 flex flex-col justify-end">
              <div className="space-y-4">
                <span className="px-3 py-1.5 bg-secondary text-white text-[9px] font-black uppercase tracking-[0.35em] rounded-full inline-block">New Protocol</span>
                <h4 className="text-3xl font-black font-display text-white tracking-tighter leading-none">
                  Nanographic<br />Printing Fleet
                </h4>
                <p className="text-blue-100/60 text-sm font-medium leading-relaxed max-w-sm">
                  Deploy ultra-high resolution assets using our new Landa platform. Sustainability meets peak production.
                </p>
                <button className="flex items-center gap-3 bg-white text-primary px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-secondary hover:text-white transition-all shadow-xl group/btn">
                  Analyze Specs
                  <ArrowRight size={16} className="group-hover/btn:translate-x-2 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
