'use client';
export const dynamic = 'force-dynamic';

import { RoleGuard } from '@/lib/role-guard';

import { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  Printer, 
  Activity, 
  AlertCircle, 
  Plus, 
  RefreshCw, 
  Loader2,
  Banknote,
  Clock,
  Package,
  BarChart3,
  Database,
  ArrowRight,
  Truck,
  CheckCircle2,
  Users
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GlobalStats } from '@/types/stats';
import { recalculateGlobalStats } from '@/lib/actions/stats';
import { DatabaseService } from '@/services/db';
import { Order } from '@/types/models';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';
import { usePaymentApprovals } from '@/lib/use-payment-approvals';

// Helper to safely format dates (handles strings, numbers, and Firestore Timestamps)
const safeFormatDate = (dateVal: any, formatStr: string = 'MMM dd, HH:mm') => {
  if (!dateVal) return '—';
  
  try {
    let date: Date;
    
    // Firestore Timestamp
    if (dateVal && typeof dateVal === 'object' && 'seconds' in dateVal) {
      date = new Date(dateVal.seconds * 1000);
    } 
    // ISO string or number
    else {
      date = new Date(dateVal);
    }

    if (isNaN(date.getTime())) return 'Invalid Date';
    return format(date, formatStr);
  } catch (e) {
    return 'Invalid Date';
  }
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [overdueOrders, setOverdueOrders] = useState<Order[]>([]);
  const { pendingPayments } = usePaymentApprovals();

  useEffect(() => {
    console.log("[Dashboard] Initializing real-time listeners...");

    let active = true;

    const loadStats = async () => {
      const { data, error } = await supabase
        .from('stats')
        .select('*')
        .eq('id', 'global')
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error('[Dashboard] Stats load failed:', error);
        toast.error('Connectivity issue with real-time metrics.');
        setStats(null);
        setLoading(false);
        return;
      }

      if (data) {
        console.log('[Dashboard] Stats received:', data);
        setStats(data as GlobalStats);
      } else {
        console.warn("[Dashboard] Stats document 'stats/global' does not exist.");
        setStats(null);
      }

      setLoading(false);
    };

    const loadExtras = async () => {
      // Top Customers by used credit/exposure
      const { data: customers } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'CUSTOMER')
        .order('usedCredit', { ascending: false })
        .limit(5);
      
      if (customers) setTopCustomers(customers);

      // Overdue Orders: older than 72 hours and not completed
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      
      // We will do a simple client-side filter since Supabase 'not.in' can be tricky with arrays
      const { data: activeOrders } = await supabase
        .from('orders')
        .select('*')
        .lt('createdAt', seventyTwoHoursAgo)
        .order('createdAt', { ascending: true })
        .limit(20);

      if (activeOrders) {
        // Filter out completed/delivered etc, AND filter out parent proxy orders
        const overdue = activeOrders.filter(o => 
          !['COMPLETED', 'DELIVERED', 'DISPATCHED', 'CANCELLED'].includes(o.status) &&
          ((o as any).parent_order_id !== null || (Array.isArray(o.items) && o.items.length === 1))
        );
        setOverdueOrders(overdue.slice(0, 5) as Order[]);
      }
    };

    void loadStats();
    void loadExtras();

    const statsChannel = supabase
      .channel('admin-dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stats' }, () => {
        void loadStats();
      })
      .subscribe();

    const unsubscribeRecent = DatabaseService.listenToRecentOrders(5, (data) => {
      console.log("[Dashboard] Recent orders received:", data.length);
      setRecentOrders(data);
    });

    return () => {
      active = false;
      void supabase.removeChannel(statsChannel);
      unsubscribeRecent();
    };
  }, []);

  const handleRecalculate = async () => {
    setRecalculating(true);
    const toastId = toast.loading("Syncing metrics with database...");
    try {
      console.log("[Dashboard] Triggering full recalculation...");
      const result = await recalculateGlobalStats();
      if (result.success) {
        console.log("[Dashboard] Recalculation success:", result.stats);
        toast.success("Metrics synchronized", { id: toastId });
      } else {
        console.error("[Dashboard] Recalculation failed:", result.error);
        toast.error(`Sync failed: ${result.error}`, { id: toastId });
      }
    } catch (error: any) {
      console.error("[Dashboard] Recalculation error:", error);
      toast.error(`Error: ${error.message}`, { id: toastId });
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Command Center...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-3xl mx-auto py-4 px-2">
        <div className="bg-white rounded border border-slate-200 p-4 text-center shadow-sm">
          <div className="mx-auto w-8 h-8 bg-indigo-50 rounded flex items-center justify-center mb-3 border border-indigo-100">
            <Database className="w-4 h-4 text-indigo-600" />
          </div>
          <h2 className="text-sm font-bold text-slate-800 mb-1 uppercase tracking-wider">Initialize Intelligence</h2>
          <p className="text-[10px] text-slate-500 max-w-md mx-auto mb-4">
            The real-time metrics engine is dormant. Initialize to aggregate historical data from orders and payments.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full max-w-xl mx-auto mb-4">
            <div className="p-2 rounded bg-slate-50 border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Step 1</p>
              <p className="text-[10px] font-bold text-slate-700">Scan Records</p>
            </div>
            <div className="p-2 rounded bg-slate-50 border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Step 2</p>
              <p className="text-[10px] font-bold text-slate-700">Aggregate Totals</p>
            </div>
            <div className="p-2 rounded bg-slate-50 border border-slate-100 text-center">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Step 3</p>
              <p className="text-[10px] font-bold text-slate-700">Live Monitoring</p>
            </div>
          </div>

          <button 
            onClick={handleRecalculate} 
            disabled={recalculating}
            className="bg-indigo-600 text-white h-7 px-3 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {recalculating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin inline" /> : <RefreshCw className="mr-1.5 h-3 w-3 inline" />}
            Activate Command Center
          </button>
        </div>
      </div>
    );
  }

  const liveAwaitingVerification = pendingPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
  const liveUnpaid = Math.max(
    0,
    (stats.financial?.totalSales || 0) - (stats.financial?.totalReceipts || 0) - liveAwaitingVerification
  );

  const STATS_CARDS = [
    { 
      label: 'All Orders Value', 
      value: `₹${(stats.financial?.totalSales || 0).toLocaleString()}`, 
      icon: TrendingUp,
      description: 'Total value of all active orders',
      color: 'text-white',
      bg: 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-200'
    },
    { 
      label: 'Collected Verified', 
      value: `₹${(stats.financial?.totalReceipts || 0).toLocaleString()}`, 
      icon: Banknote,
      description: 'Verified and collected payment amount',
      color: 'text-white',
      bg: 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-md shadow-blue-200'
    },
    { 
      label: 'Awaiting Verification', 
      value: `₹${liveAwaitingVerification.toLocaleString()}`, 
      icon: Clock,
      description: 'Uploaded payment proofs pending review',
      color: 'text-white',
      bg: 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-md shadow-amber-200'
    },
    { 
      label: 'Unpaid / No Proof', 
      value: `₹${liveUnpaid.toLocaleString()}`, 
      icon: AlertCircle,
      description: 'Orders without an uploaded payment image',
      color: 'text-white',
      bg: 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-md shadow-rose-200'
    },
  ];

  const mockRevenueData = [
    { name: 'Mon', revenue: Math.max(0, (stats?.financial?.totalSales || 0) * 0.1) },
    { name: 'Tue', revenue: Math.max(0, (stats?.financial?.totalSales || 0) * 0.15) },
    { name: 'Wed', revenue: Math.max(0, (stats?.financial?.totalSales || 0) * 0.12) },
    { name: 'Thu', revenue: Math.max(0, (stats?.financial?.totalSales || 0) * 0.2) },
    { name: 'Fri', revenue: Math.max(0, (stats?.financial?.totalSales || 0) * 0.18) },
    { name: 'Sat', revenue: Math.max(0, (stats?.financial?.totalSales || 0) * 0.25) },
    { name: 'Sun', revenue: (stats?.financial?.totalSales || 0) }
  ];

  const handleMigrate = async (dryRun: boolean) => {
    const toastId = toast.loading(`${dryRun ? 'Simulating' : 'Backfilling'} customer financials...`);
    try {
      const { migrateCustomerFinancials } = await import('@/lib/actions/accounts');
      const result = await migrateCustomerFinancials(dryRun);
      if (result.success) {
        toast.success(`Processed ${result.processedCount} customers successfully.`, { id: toastId });
        if (!dryRun) handleRecalculate(); // Refresh global stats too
      }
    } catch (error: any) {
      toast.error(`Migration failed: ${error.message}`, { id: toastId });
    }
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'SUPPORT']}>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-12">
      {/* Header */}
      <section className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8 pt-2">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="body text-[var(--google-text-secondary)] mt-1">
            Real-time operational monitoring and financial intelligence.
          </p>
        </div>
        
        {/* Maintenance Utilities */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRecalculate}
            disabled={recalculating}
            className="btn bg-[var(--google-hover)] text-[var(--google-text)] hover:bg-[#e2e3e5] transition-all disabled:opacity-50"
          >
            {recalculating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync Metrics
          </button>
        </div>
      </section>

      {/* Quick Approve Action */}
      {liveAwaitingVerification > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between mb-8 shadow-sm">
           <div className="flex items-center gap-3">
             <AlertCircle className="text-amber-600 h-5 w-5" />
             <div>
               <h3 className="text-sm font-bold text-amber-900">Payments Pending Approval</h3>
               <p className="text-xs text-amber-700">There are ₹{liveAwaitingVerification.toLocaleString()} in payments waiting for accountant verification.</p>
             </div>
           </div>
           <Link href="/admin/payments" className="btn bg-amber-600 hover:bg-amber-700 text-white shadow-sm whitespace-nowrap">
             Review Payments
           </Link>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATS_CARDS.map((stat, i) => (
          <div key={i} className="card flex items-start justify-between hover:shadow-md transition-shadow">
            <div>
               <p className="table-header mb-3">{stat.label}</p>
               <h3 className="text-[32px] font-normal text-[var(--google-text)] tracking-tight leading-none mb-2">{stat.value}</h3>
               <p className="caption">
                 {stat.description}
               </p>
            </div>
            <div className={`p-3 rounded-full ${stat.bg} ${stat.color} shadow-none`}>
              <stat.icon size={24} strokeWidth={2} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Production & Logistics Column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
           {/* Production Pipeline */}
           <div className="card">
             <div className="flex items-center justify-between mb-6">
               <h2 className="table-header text-[var(--google-text)]">Production Pipeline</h2>
               <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider">{stats.orders.total} Total Orders</span>
             </div>
             
             <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[11px] font-medium text-[var(--google-text)] mb-1 uppercase tracking-wider">
                    <span>Pre-Press (Placed / Verified)</span>
                    <span className="font-bold">{stats.orders.placed + stats.orders.paymentPending + stats.orders.verified}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.max(2, ((stats.orders.placed + stats.orders.paymentPending + stats.orders.verified) / Math.max(1, stats.orders.total)) * 100)}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-medium text-[var(--google-text)] mb-1 uppercase tracking-wider">
                    <span>In Production (Assigned / In Progress)</span>
                    <span className="font-bold">{stats.orders.assigned + stats.orders.inProgress}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${Math.max(2, ((stats.orders.assigned + stats.orders.inProgress) / Math.max(1, stats.orders.total)) * 100)}%` }}></div>
                  </div>
                </div>
             </div>
           </div>

           {/* Logistics & Delivery */}
           <div className="grid grid-cols-2 gap-4">
              <div className="card bg-emerald-50/50 border-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mb-2" />
                <h3 className="text-[24px] font-normal text-emerald-900 leading-none mb-1">{stats.orders.completed}</h3>
                <p className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider">Ready for Dispatch</p>
              </div>
              <div className="card bg-blue-50/50 border-blue-100">
                <Truck className="h-5 w-5 text-blue-600 mb-2" />
                <h3 className="text-[24px] font-normal text-blue-900 leading-none mb-1">{stats.orders.dispatched}</h3>
                <p className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">Out for Delivery</p>
              </div>
           </div>

           {/* Revenue Trends */}
           <div className="card">
             <h2 className="table-header text-[var(--google-text)] mb-4">Revenue Trends (7 Days)</h2>
             <div className="h-[220px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={mockRevenueData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#5f6368'}} dy={10} />
                   <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#5f6368'}} tickFormatter={(val) => `₹${(val/1000).toFixed(1)}k`} dx={-10} />
                   <Tooltip 
                     formatter={(value: any) => [`₹${Number(value).toLocaleString(undefined, {minimumFractionDigits: 0})}`, 'Revenue']}
                     contentStyle={{ borderRadius: '8px', border: '1px solid #dadce0', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', fontSize: '12px' }}
                   />
                   <Area type="monotone" dataKey="revenue" stroke="#1a73e8" fill="#e8f0fe" strokeWidth={2} />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
           </div>
        </div>

        {/* Sidebar Column */}
        <div className="flex flex-col gap-6">
           {/* Overdue Orders Alert */}
           {overdueOrders.length > 0 && (
             <div className="card bg-rose-50 border-rose-100">
               <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center gap-2">
                   <AlertCircle className="h-4 w-4 text-rose-600" />
                   <h2 className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">Overdue Alerts</h2>
                 </div>
                 <span className="bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded-full text-[9px] font-bold">{overdueOrders.length}</span>
               </div>
               <div className="space-y-2">
                 {overdueOrders.map(order => (
                   <Link href={`/admin/orders/${order.id}`} key={order.id} className="block bg-white p-2 rounded border border-rose-100 hover:border-rose-300 transition-colors shadow-sm">
                     <div className="flex justify-between items-center">
                       <span className="font-bold text-[11px] text-slate-800">#{order.id.slice(-4)}</span>
                       <span className="text-[9px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">{order.status}</span>
                     </div>
                     <p className="text-[10px] text-slate-500 mt-1 truncate">{order.customerSnapshot?.displayName || order.customerSnapshot?.name || order.customerName}</p>
                   </Link>
                 ))}
               </div>
             </div>
           )}

           {/* Top Customers */}
           <div className="card flex-1">
             <div className="flex items-center gap-2 mb-4">
               <Users className="h-4 w-4 text-[var(--google-text-secondary)]" />
               <h2 className="table-header text-[var(--google-text)]">Top Customers (Credit)</h2>
             </div>
             <div className="space-y-3">
               {topCustomers.map(customer => (
                 <div key={customer.uid} className="flex justify-between items-center border-b border-[var(--google-border)] pb-3 last:border-0 last:pb-0">
                   <div className="overflow-hidden">
                     <p className="text-[13px] font-medium text-[var(--google-text)] truncate">{customer.name || customer.displayName || 'Unknown'}</p>
                     <p className="text-[10px] text-[var(--google-text-secondary)] truncate">{customer.phone || 'No phone'}</p>
                   </div>
                   <div className="text-right flex-shrink-0 ml-2">
                     <p className="text-xs font-bold text-amber-700">₹{(customer.usedCredit || 0).toLocaleString()}</p>
                     <p className="text-[9px] text-[var(--google-text-secondary)] uppercase tracking-wider">Exposure</p>
                   </div>
                 </div>
               ))}
               {topCustomers.length === 0 && (
                 <p className="text-xs text-center text-[var(--google-text-secondary)] py-4">No customer data found.</p>
               )}
             </div>
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 gap-4">
        {/* Recent Activity */}
        <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-800 tracking-wider">Recent Fleet Activity</h2>
              <p className="text-xs text-slate-500 mt-0.5 uppercase tracking-wide">Latest orders in workflow</p>
            </div>
            <Link href="/admin/orders" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-wider bg-indigo-50 px-3 py-1.5 rounded-full transition-colors">
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            <div className="min-w-[700px] divide-y divide-slate-100">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-white text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100">
                <div className="col-span-2">Order ID</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-2">Details</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>
              
              {/* Table Body */}
              {recentOrders.length === 0 ? (
                <div className="py-4 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  No recent activity detected.
                </div>
              ) : (
                recentOrders.map((order) => (
                  <Link 
                    key={order.id} 
                    href={`/admin/orders/${order.id}`}
                    className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-slate-50/80 transition-all duration-300 group hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)] relative hover:z-10"
                  >
                    <div className="col-span-2">
                      <span className="font-mono text-xs font-bold text-indigo-600 group-hover:text-indigo-800 transition-colors bg-indigo-50 px-2 py-1 rounded-md">
                        #{order.id.slice(-4)}
                      </span>
                    </div>
                    <div className="col-span-3">
                      <span className="font-bold text-slate-800 text-sm truncate block group-hover:text-indigo-600 transition-colors">
                        {order.customerSnapshot?.displayName || order.customerSnapshot?.name || order.customerName || 'Unknown'}
                      </span>
                    </div>
                    <div className="col-span-2 flex flex-col gap-0.5 text-xs text-slate-500 font-medium">
                      <span className="text-slate-700">
                        {order.items?.length || 0} unit{order.items?.length !== 1 && 's'}
                      </span>
                      <span className="truncate whitespace-nowrap text-[11px] text-slate-400">{safeFormatDate(order.createdAt, 'MMM dd, HH:mm')}</span>
                    </div>
                    <div className="col-span-3 flex flex-col gap-2">
                      <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-md uppercase tracking-wider whitespace-nowrap self-start shadow-sm ${
                        order.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                        order.status.includes('APPROVED') || order.status.includes('VERIFIED') ? 'bg-teal-50 text-teal-700 border border-teal-100' : 
                        order.status === 'PLACED' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 
                        order.status === 'PAYMENT_PENDING' || (order.status as string) === 'PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 
                        order.status === 'DESIGNING' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 
                        order.status === 'DISPATCHED' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 
                        order.status === 'IN_PROGRESS' || order.status.includes('PROGRESS') ? 'bg-orange-50 text-orange-700 border border-orange-100' : 
                        'bg-slate-50 text-slate-600 border border-slate-200'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current opacity-75" />
                        {order.status}
                      </span>
                      {order.workflowSnapshot && (
                        <div className="hidden sm:block mt-1">
                          <WorkflowPipelineVisual snapshot={order.workflowSnapshot} />
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="font-bold text-slate-800 text-sm whitespace-nowrap tracking-tight">
                        ₹{(order.amounts?.grandTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </RoleGuard>
  );
}


