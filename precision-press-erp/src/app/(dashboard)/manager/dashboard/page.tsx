'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { 
  Users, 
  Printer, 
  Activity,
  ClipboardList,
  Loader2,
  UserPlus,
  Plus,
  ShoppingCart,
  CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  getDocs,
  limit
} from '@/lib/supabase-firestore-shim';
import { Order, UserProfile } from '@/types/models';
import { assignPrinter } from '@/lib/workflow';
import { STATUS_LABELS, STATUS_COLORS } from '@/types/workflow';
import { ManagerUnassignedBacklog } from '@/components/dashboard/ManagerUnassignedBacklog';
import { RoleActiveJobs } from '@/components/dashboard/RoleActiveJobs';

export default function ManagerDashboard() {
  const { user, profile } = useAuth();
  const [activeJobsScope, setActiveJobsScope] = useState<'mine' | 'all'>('all');
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [activeJobs, setActiveJobs] = useState<Order[]>([]);
  const [printers, setPrinters] = useState<UserProfile[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // 1. Listen for orders needing assignment (Accountant-approved orders)
    const qPending = query(
      collection(db, 'orders'),
      where('status', '==', 'ACCOUNTANT_APPROVED'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubPending = onSnapshot(qPending, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      // Only show orders that have reached PAYMENT_VERIFIED status
      setPendingOrders(orders);
    });

    // 2. Listen for active production
    const qActive = query(
      collection(db, 'orders'),
      where('status', 'in', ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED']),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubActive = onSnapshot(qActive, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Order[];
      setActiveJobs(orders);
      setLoading(false);
    });

    const fetchPrinters = async () => {
      const q = query(collection(db, 'profiles'), where('role', '==', 'PRINTER'), limit(50));
      const snap = await getDocs(q);
      setPrinters(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    };

    const fetchStats = async () => {
      const { getManagerStats } = await import('@/lib/actions/reports');
      const data = await getManagerStats();
      setStats(data);
    };

    fetchPrinters();
    fetchStats();

    return () => {
      unsubPending();
      unsubActive();
    };
  }, [user]);

  const handleAssign = async (orderId: string, printerId: string) => {
    if (!user || !printerId) return;
    setProcessingId(orderId);
    try {
      await assignPrinter(orderId, printerId);
    } catch (error) {
      console.error('Assignment failed:', error);
      alert('Assignment failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const STATS = [
    { label: 'Total Revenue', value: `₹${(stats?.totalSales || 0).toLocaleString()}`, sub: 'Gross Sales', icon: Activity, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Total Receipts', value: `₹${(stats?.totalReceipts || 0).toLocaleString()}`, sub: 'Collected', icon: CheckCircle, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Credit Exposure', value: `₹${(stats?.creditExposure || 0).toLocaleString()}`, sub: 'Outstanding', icon: Users, color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'Pending Colls', value: `₹${(stats?.pendingPayments || 0).toLocaleString()}`, sub: 'To Collect', icon: ClipboardList, color: 'text-purple-700', bg: 'bg-purple-50' },
  ];

  const handleSeed = async () => {
    try {
      const res = await fetch('/api/temp-seed');
      const data = await res.json();
      if (data.success) alert(`Success: ${data.message}`);
      else alert(`Error: ${data.error}`);
    } catch (error) {
      alert('Seed failed');
    }
  };

  return (
    <RoleGuard allowedRoles={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-3 animate-in fade-in duration-300">
        {/* Header */}
        <section className="flex justify-between items-center bg-white p-3 rounded border border-slate-200">
          <div>
            <h1 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Ops Dashboard</h1>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Production assignment & financial overview.</p>
          </div>
          <div className="flex gap-1.5">
            <button 
              onClick={handleSeed}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors uppercase tracking-wider"
            >
              <Activity size={11} />
              Seed
            </button>
            <Link 
              href="/proxy-order"
              className="px-2 py-1.5 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 flex items-center gap-1 transition-colors uppercase tracking-wider"
            >
              <Plus size={11} />
              Proxy Order
            </Link>
          </div>
        </section>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {STATS.map((stat, i) => (
            <div key={i} className={`p-2.5 rounded ${stat.bg} flex items-center justify-between border border-black/5 shadow-sm`}>
              <div>
                <span className={`text-[9px] font-bold uppercase tracking-wider ${stat.color} opacity-80`}>{stat.label}</span>
                <h3 className={`text-base font-bold ${stat.color} leading-none mt-0.5`}>{stat.value}</h3>
                <span className={`text-[9px] font-medium ${stat.color} opacity-60`}>{stat.sub}</span>
              </div>
              <div className={`p-1.5 rounded bg-white/50`}>
                <stat.icon size={14} className={stat.color} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <ManagerUnassignedBacklog role={profile?.role || 'MANAGER'} />

          {/* Right Column: Identity Vault + Live Production */}
          <div className="flex flex-col gap-2">
            <div className="bg-white border border-slate-200 rounded shadow-sm">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Identity Vault</h3>
                <Link href="/manager/customers" className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider">View All</Link>
              </div>
              <div className="p-2">
                <Link 
                  href="/manager/customers"
                  className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200 hover:border-indigo-300 transition-colors group"
                >
                  <div className="w-7 h-7 bg-indigo-100 text-indigo-600 rounded flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Users size={13} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-800">Manage Customers</p>
                    <p className="text-[9px] text-slate-500">Credit, payments & ledger</p>
                  </div>
                </Link>
              </div>
            </div>

            {/* Active production preview */}
            <section className="bg-white border border-slate-200 rounded shadow-sm p-2 space-y-2">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveJobsScope('mine')}
                  className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider border transition-colors ${
                    activeJobsScope === 'mine'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  My Assigned Jobs
                </button>
                <button
                  type="button"
                  onClick={() => setActiveJobsScope('all')}
                  className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider border transition-colors ${
                    activeJobsScope === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Active Jobs
                </button>
              </div>

              <RoleActiveJobs
                role={profile?.role || 'MANAGER'}
                dataMode="manager-printer-assignments"
                assignmentScope={activeJobsScope}
                assignedByUserId={profile?.uid || user?.uid}
                title={activeJobsScope === 'all' ? 'All Active Jobs' : 'Manager Active Jobs'}
                subtitle={activeJobsScope === 'all'
                  ? 'All orders assigned to printers'
                  : 'Orders assigned to printers by this account'}
                emptyMessage={activeJobsScope === 'all'
                  ? 'No active printer-assigned orders.'
                  : 'No active jobs assigned by this account.'}
              />
            </section>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

