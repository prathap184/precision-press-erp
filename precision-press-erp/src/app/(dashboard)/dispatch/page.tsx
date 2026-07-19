'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';
import { 
  Package, 
  Truck, 
  MapPin, 
  Clock, 
  ArrowRight,
  Loader2,
  CheckCircle,
  Search,
  LayoutGrid,
  X,
  Upload
} from 'lucide-react';
import { StaffRoleSwitcher } from '@/components/dashboard/StaffRoleSwitcher';
import { StaffRole } from '@/types/roles';
import { RoleGuard } from '@/lib/role-guard';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  limit 
} from '@/lib/supabase-firestore-shim';
import { dispatchOrder, markInTransit, deliverOrder } from '@/lib/workflow';
import { getDeliveryProofUrl } from '@/lib/order-proof';
import { Order } from '@/types/models';
import { useAuth } from '@/lib/auth-context';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { WorkflowTaskQueue } from '@/components/production/WorkflowTaskQueue';
export default function LogisticsDashboard() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightOrderId = searchParams.get('orderId');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'completed' | 'all'>('pending');

  useEffect(() => {
    if (!user) return;

    // Listen for all orders relevant to dispatch: those in DISPATCH role and delivered orders
    const pendingQuery = query(
      collection(db, 'orders'),
      where('currentWorkflowRole', '==', 'DISPATCH'),
      orderBy('updatedAt', 'desc'),
      limit(100)
    );

    const deliveredQuery = query(
      collection(db, 'orders'),
      where('status', 'in', ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED']),
      orderBy('updatedAt', 'desc'),
      limit(100)
    );

    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      const pendingData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(prev => {
        const delivered = prev.filter(o => ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED'].includes(o.status));
        return [...pendingData, ...delivered];
      });
      setLoading(false);
    }, (error) => {
      console.error("[onSnapshot] Pending dispatch listener failed:", error);
      setLoading(false);
    });

    const unsubscribeDelivered = onSnapshot(deliveredQuery, (snapshot) => {
      const deliveredData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(prev => {
        const pending = prev.filter(o => o.currentWorkflowRole === 'DISPATCH');
        return [...pending, ...deliveredData];
      });
    }, (error) => {
      console.error("[onSnapshot] Delivered orders listener failed:", error);
    });

    return () => {
      unsubscribePending();
      unsubscribeDelivered();
    };
  }, [user]);


  const handleMarkInTransit = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      const result = await markInTransit(orderId, 'Order is currently in transit to destination');
      if (!result?.success) throw new Error('Action failed');
    } catch (error) {
      console.error("Mark in transit failed:", error);
      alert("Failed to update status to In Transit.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeliverOrder = async (orderId: string, proof: string | null) => {
    if (!proof) {
      alert('Please upload a delivery proof photo before marking this order as delivered.');
      return;
    }

    setActionLoading(orderId);
    try {
      const result = await deliverOrder(orderId, 'Order delivered successfully', proof);
      if (!result?.success) throw new Error('Action failed');
      setProofUrl(null);
      setProofError(null);
      // Refresh after successful delivery
      router.push(`/admin/orders?highlight=${orderId}`);
    } catch (error: any) {
      console.error("Delivery failed:", error);
      const errorMsg = error?.message || error?.toString() || 'Failed to update status to Delivered.';
      alert(`Delivery Error: ${errorMsg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleProofUpload = async (file: File) => {
    setProofUploading(true);
    setProofError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/designs/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Upload failed');
      setProofUrl(data.fileUrl);
    } catch (err: any) {
      console.error('Proof upload failed:', err);
      setProofError(err.message || 'Failed to upload proof photo.');
    } finally {
      setProofUploading(false);
    }
  };

  const readyToDispatch = orders
    .filter((o: Order) => o.status === 'COMPLETED')
    .filter((o: Order) => 
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerSnapshot?.displayName || o.customerSnapshot?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  
  const activeTransits = orders
    .filter((o: Order) => o.status === 'DISPATCHED' || o.status === 'IN_TRANSIT')
    .filter((o: Order) => 
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerSnapshot?.displayName || o.customerSnapshot?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  
  const deliveredHistory = orders
    .filter((o: Order) => o.status === 'DELIVERED')
    .filter((o: Order) => 
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerSnapshot?.displayName || o.customerSnapshot?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  
  // Tab-based filtering for new dispatch dashboard
  const pendingOrders = orders
    .filter((o: Order) => o.currentWorkflowRole === 'DISPATCH')
    .filter((o: Order) => 
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerSnapshot?.displayName || o.customerSnapshot?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  
  const myCompletedOrders = orders
    .filter((o: Order) => ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED'].includes(o.status) && (
      (o as any).dispatchCompletedBy === user?.uid || (o.dispatchInfo as any)?.dispatchedBy === user?.uid || (o.workflowSnapshot?.steps || []).some(s => s.role === 'DISPATCH' && s.status === 'COMPLETED' && s.completedBy === user?.uid)
    ))
    .filter((o: Order) => 
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerSnapshot?.displayName || o.customerSnapshot?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  
  const allCompletedOrders = orders
    .filter((o: Order) => ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED'].includes(o.status))
    .filter((o: Order) => 
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerSnapshot?.displayName || o.customerSnapshot?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <RoleGuard allowedRoles={['DISPATCH', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']}>
      <div className="space-y-6 animate-in fade-in duration-1000 slide-in-from-bottom-4">
        <StaffRoleSwitcher userRoles={(profile?.roles as StaffRole[]) || []} />
        
        {/* Header Section */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-black text-secondary uppercase tracking-[0.4em] mb-4">Logistics & Delivery</p>
            <h1 className="text-4xl font-black font-display text-primary tracking-tighter italic uppercase underline decoration-secondary decoration-wavy underline-offset-8">Dispatch Dashboard</h1>
            <p className="text-on-surface-variant font-medium mt-4 max-w-lg opacity-60">
              Operational control for order hand-offs. Manage pick-ups and shipping from a central terminal.
            </p>
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-primary/20" size={18} />
            <input 
              type="text"
              placeholder="Search ID / Customer..."
              className="w-full bg-white border-none rounded-[1.5rem] pl-14 pr-6 py-5 text-sm font-bold text-primary outline-none focus:ring-4 focus:ring-secondary/5 transition-all shadow-xl shadow-primary/5"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </section>

        {/* Dispatch Tabs */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-1 flex gap-1">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${
              activeTab === 'pending'
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-transparent text-slate-600 hover:bg-slate-50'
            }`}
          >
            Pending Orders ({pendingOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${
              activeTab === 'completed'
                ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                : 'bg-transparent text-slate-600 hover:bg-slate-50'
            }`}
          >
            My Completed ({myCompletedOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${
              activeTab === 'all'
                ? 'bg-slate-700 text-white shadow-lg shadow-slate-700/20'
                : 'bg-transparent text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Completed ({allCompletedOrders.length})
          </button>
        </section>

        {/* Stats Row - Only show for Pending tab */}
        {activeTab === 'pending' && (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-primary/5 border-l-4 border-secondary transition-all hover:scale-105">
            <p className="text-[10px] font-black text-secondary uppercase tracking-widest opacity-50 mb-4 font-display">Ready for Dispatch</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-primary font-display">{readyToDispatch.length}</span>
              <span className="text-[10px] font-bold text-on-surface-variant/40 italic">Orders</span>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-primary/5 transition-all hover:scale-105">
            <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest mb-4 font-display">Dispatched Today</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-primary font-display">
                {orders.filter(o => o.status === 'DISPATCHED' && new Date(o.updatedAt).toDateString() === new Date().toDateString()).length}
              </span>
              <span className="text-[10px] font-bold text-on-surface-variant/40 italic">Delivered</span>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-primary/5 transition-all hover:scale-105">
            <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest mb-4 font-display">Self Pickups</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-primary font-display">
                {orders.filter(o => o.dispatchInfo?.method === 'PICKUP').length}
              </span>
              <span className="text-[10px] font-bold text-on-surface-variant/40 italic">Units</span>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-primary/5 transition-all hover:scale-105">
            <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest mb-4 font-display">Courier/Transit</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-primary font-display">
                {orders.filter(o => ['COURIER', 'TRANSPORT'].includes(o.dispatchInfo?.method || '')).length}
              </span>
              <span className="text-[10px] font-bold text-on-surface-variant/40 italic">Logged</span>
            </div>
          </div>
        </section>
        )}

        {activeTab === 'pending' && (
        <WorkflowTaskQueue 
          role="DISPATCH"
          title="Pending Dispatch Queue"
          icon={<Package className="w-6 h-6" />}
          highlightOrderId={highlightOrderId}
          orderHrefBuilder={(order) => `/dispatch/orders/${order.id}?returnTo=${encodeURIComponent('/admin/orders?highlight=' + order.id)}`}
          renderActions={(order: Order, isProcessing: boolean) => {
            const currentStep = order.workflowSnapshot?.steps[order.workflowSnapshot.currentStepIndex];
            if (currentStep?.status === 'COMPLETED') return null;

            const label = currentStep?.status === 'IN_PROGRESS'
              ? 'Continue Dispatch Workspace'
              : 'Open Dispatch Workspace';

            return (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => {
                    router.push(`/dispatch/orders/${order.id}?returnTo=${encodeURIComponent('/admin/orders?highlight=' + order.id)}`);
                  }}
                  disabled={isProcessing}
                  className="bg-primary text-white h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-primary/10"
                >
                  {label} <ArrowRight size={14} />
                </button>
              </div>
            );
          }}
          renderExpanded={(order: Order) => {
            const deliveryProofUrl = getDeliveryProofUrl(order);
            const invalidProofMessage = (order.deliveryProof?.url || order.workflow?.deliveryProof?.url) && !deliveryProofUrl
              ? 'Existing delivery proof is stored as a local file path and cannot be displayed. Upload a new proof image.'
              : null;

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Order Details</h4>
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-primary">Customer: <span className="font-medium">{order.customerSnapshot?.displayName || order.customerSnapshot?.name}</span></p>
                    <p className="text-sm font-bold text-primary">Type: <span className="font-medium">{order.orderType}</span></p>
                    <p className="text-sm font-bold text-primary">Requested: <span className="font-medium">{order.delivery?.choice || 'PICKUP'}</span></p>
                    {order.delivery?.address && (
                      <p className="text-sm font-bold text-primary flex items-start gap-2">
                        Address: <span className="font-medium text-xs leading-tight">{order.delivery.address}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                <h4 className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Financial Summary</h4>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Grand Total</span>
                    <span className="text-sm font-black text-primary italic">₹{order.amounts?.grandTotal?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Status</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {order.paymentStatus || 'PENDING'}
                    </span>
                  </div>
                </div>
              </div>
              {['DISPATCHED', 'IN_TRANSIT'].includes(order.status) && (
                <div className="md:col-span-2 pt-4 border-t border-slate-100">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-black text-primary uppercase tracking-[0.2em]">Delivery Proof</h4>
                      <p className="text-sm text-slate-500 mt-2">
                        {order.delivery?.choice === 'PICKUP'
                          ? 'Customer pickup orders must be marked delivered only after handover and proof upload.'
                          : 'Upload a delivery proof photo and then mark this order delivered.'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-4">
                      <label className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-primary/20 bg-white px-4 py-3 text-sm font-bold text-primary hover:bg-primary/5 transition-colors">
                        <Upload size={16} />
                        {proofUrl || deliveryProofUrl ? 'Replace proof photo' : 'Upload proof photo'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleProofUpload(file);
                          }}
                          disabled={proofUploading}
                        />
                      </label>

                      {proofUploading && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Loader2 className="animate-spin" size={16} /> Uploading proof...
                        </div>
                      )}

                      {proofError && <p className="text-sm text-red-600">{proofError}</p>}

                      {invalidProofMessage && (
                        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                          {invalidProofMessage}
                        </div>
                      )}

                      {deliveryProofUrl && (
                        <div className="overflow-hidden rounded-3xl border border-slate-200">
                          <img
                            src={deliveryProofUrl}
                            alt="Delivery proof"
                            className="w-full object-cover max-h-72"
                          />
                        </div>
                      )}

                      <button
                        onClick={() => handleDeliverOrder(order.id, proofUrl || deliveryProofUrl || null)}
                        disabled={actionLoading === order.id || (!proofUrl && !deliveryProofUrl)}
                        className="bg-green-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm disabled:opacity-50 transition-colors hover:bg-green-700 flex items-center justify-center gap-3"
                      >
                        {actionLoading === order.id ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                        {actionLoading === order.id ? 'Completing...' : 'Mark Delivered'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        }}
        />
        )}

        {activeTab === 'completed' && (
          <section className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-black text-primary uppercase tracking-tight mb-6">My Completed Orders</h2>
              {myCompletedOrders.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 font-medium">No completed orders yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myCompletedOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl hover:bg-white transition-all border border-slate-100">
                      <div className="flex items-center gap-4 flex-1">
                        <CheckCircle size={20} className="text-green-500" />
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">{order.id}</p>
                          <p className="text-sm font-bold text-primary">{order.customerSnapshot?.displayName || order.customerSnapshot?.name}</p>
                          <p className="text-[10px] text-slate-500 mt-1">{order.delivery?.choice || 'PICKUP'}</p>
                        </div>
                      </div>
                      {getDeliveryProofUrl(order) && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                          <img
                            src={getDeliveryProofUrl(order) || ''}
                            alt="Proof"
                            className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'all' && (
          <section className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-black text-primary uppercase tracking-tight mb-6">All Completed Orders</h2>
              {allCompletedOrders.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500 font-medium">No completed orders</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allCompletedOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl hover:bg-white transition-all border border-slate-100">
                      <div className="flex items-center gap-4 flex-1">
                        <CheckCircle size={20} className="text-green-500" />
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">{order.id}</p>
                          <p className="text-sm font-bold text-primary">{order.customerSnapshot?.displayName || order.customerSnapshot?.name}</p>
                          <p className="text-[10px] text-slate-500 mt-1">{order.delivery?.choice || 'PICKUP'} • Completed by: {(order as any).dispatchCompletedByName || 'Staff'}</p>
                        </div>
                      </div>
                      {getDeliveryProofUrl(order) && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                          <img
                            src={getDeliveryProofUrl(order) || ''}
                            alt="Proof"
                            className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

</div>

    </RoleGuard>
  );
}

