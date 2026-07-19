'use client';


import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { 
  doc, 
  onSnapshot, 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy,
  updateDoc
} from '@/lib/supabase-firestore-shim';
import { Order, OrderItem } from '@/types/models';
import { useAuth } from '@/lib/auth-context';
import { 
  ChevronLeft, 
  Download, 
  Printer, 
  Package, 
  Truck, 
  ShieldCheck, 
  FileText,
  ImageIcon,
  Eye,
  CreditCard,
  User,
  Clock,
  Loader2,
  Activity,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

interface ActivityLog {
  id: string;
  userId: string;
  userRole: string;
  action: string;
  meta: any;
  timestamp: any;
}

const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const fmtDate = (v: any) => {
  if (!v) return '—';
  let d: Date;
  if (v?.seconds) d = new Date(v.seconds * 1000);
  else d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { 
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

export default function OrderDetailsViewPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, role } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [verifyingItemId, setVerifyingItemId] = useState<string | null>(null);

  const handleVerifyDesign = async (itemId: string) => {
    setVerifyingItemId(itemId);
    try {
      await updateDoc(doc(db, 'orders', id as string, 'items', itemId), {
        designStatus: 'APPROVED',
      });
      // Reflect locally immediately
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, designStatus: 'APPROVED' } : i));
      // Small toast
      const t = await import('react-hot-toast');
      t.toast.success('Design verified! The designer can now proceed.');
    } catch (err: any) {
      const t = await import('react-hot-toast');
      t.toast.error(err.message || 'Verification failed.');
    } finally {
      setVerifyingItemId(null);
    }
  };

  useEffect(() => {
    if (!id) return;

    const unsubOrder = onSnapshot(doc(db, 'orders', id as string), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Order;
        // Verify ownership for customers
        const isStaff = role && role !== 'CUSTOMER';
        if (user && !isStaff && data.customerId !== user.uid) {
          setError('Unauthorized');
          setLoading(false);
          return;
        }
        const { id: _, ...rest } = data;
        setOrder({ ...rest, id: doc.id });
      } else {
        setError('Not Found');
      }
      setLoading(false);
    }, (err) => {
      console.error("Order Load Error:", err);
      setError(err.message.includes('permission') ? 'Insufficient Permissions' : 'Load Failed');
      setLoading(false);
    });

    const fetchData = async () => {
      try {
        // 1. Items
        const itemsSnap = await getDocs(collection(db, `orders/${id}/items`));
        if (itemsSnap.empty) {
          console.warn("No items found in subcollection for order:", id);
        }
        setItems(itemsSnap.docs.map(d => ({ ...d.data(), id: d.id } as OrderItem)));
      } catch (err: any) {
        console.error("Items Fetch Error:", err);
        setItemsError(err.message.includes('permission') ? 'restricted' : 'failed');
      }

      try {
        // 2. Status History / Logs
        // Try simple query first to avoid index requirements if not already existing
        const qLogs = query(
          collection(db, 'activity_logs'),
          where('meta.orderId', '==', id)
        );
        const logsSnap = await getDocs(qLogs);
        let logData = logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
        // Sort manually if index is missing
        logData.sort((a, b) => {
          const tA = a.timestamp?.seconds || 0;
          const tB = b.timestamp?.seconds || 0;
          return tB - tA;
        });
        setLogs(logData);
      } catch (err: any) {
        console.error("Logs Fetch Error:", err);
        setLogsError(err.message.includes('permission') ? 'restricted' : 'failed');
      }
    };

    fetchData();
    return () => unsubOrder();
  }, [id, user, role]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-primary" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/40">Loading Order Ledger...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4 text-center">
        <AlertCircle className="text-red-500 mb-2" size={48} />
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">
          {error === 'Unauthorized' ? 'Access Restricted' : error || 'Record Not Found'}
        </h2>
        <p className="text-slate-400 text-sm font-medium max-w-xs">
          {error === 'Unauthorized' 
            ? 'This ledger belongs to another counter. Access is restricted to designated personnel.' 
            : 'The document requested could not be retrieved from the main server.'}
        </p>
        <Link 
          href="/dashboard/orders" 
          className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
        >
          Return to Ledger
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-32 animate-in fade-in duration-700">
      
      {/* Editorial Navigation */}
      <section className="flex items-center justify-between">
        <Link 
          href={`/dashboard/orders/${id}`}
          className="group flex items-center gap-3 text-slate-400 hover:text-slate-900 transition-all font-black text-[10px] uppercase tracking-widest"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all">
            <ChevronLeft size={16} />
          </div>
          Back to Tracking
        </Link>
        <div className="flex gap-4">
          <button 
            onClick={() => window.print()}
            className="bg-white border border-slate-100 h-12 px-6 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm print:hidden"
          >
            <Printer size={16} /> Print Receipt
          </button>
          <button 
            onClick={() => window.print()}
            className="bg-primary text-white h-12 px-6 rounded-xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 print:hidden"
          >
            <Download size={16} /> Export PDF
          </button>
       </div>
     </section>

     {/* 🟢 PRINT STYLES */}
     <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print\\:hidden { display: none !important; }
          aside, nav, .fixed, .sticky, button { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
          .shadow-sm, .shadow-md, .shadow-lg, .shadow-xl { box-shadow: none !important; border: 1px solid #f1f5f9 !important; }
          .rounded-[2rem], .rounded-[2.5rem] { border-radius: 1rem !important; }
          .bg-slate-50 { background-color: #f8fafc !important; }
          .text-slate-900 { color: #0f172a !important; }
          .max-w-7xl { max-width: 100% !important; width: 100% !important; margin: 0 !important; }
        }
     `}} />

      {/* 🟢 MAIN GRID (Split Layout) */}
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* LEFT COLUMN: 75% Administrative Summary */}
        <div className="lg:w-3/4 space-y-8">
        
        {/* 1. PRIMARY ORDER TABLE (Order Summary) */}
        <section className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
           <div className="bg-slate-50 px-8 py-4 border-b border-slate-100">
             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 italic flex items-center gap-3">
               <Package size={14} className="text-secondary" /> Administrative Summary
             </h3>
           </div>
           
           <div className="divide-y divide-slate-100">
              {/* Row: Order ID */}
              <div className="grid grid-cols-3">
                 <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">Order ID</div>
                 <div className="col-span-2 px-8 py-5 text-sm font-black text-slate-900">{order.id}</div>
              </div>

              {/* Row: Products */}
              <div className="grid grid-cols-3">
                 <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">Products</div>
                 <div className="col-span-2 px-8 py-5 text-sm font-black text-slate-900">
                   {items.map(i => i.productName).join(' + ')}
                 </div>
              </div>

              {/* Row: Description */}
              <div className="grid grid-cols-3">
                 <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">Description</div>
                 <div className="col-span-2 px-8 py-6 space-y-4">
                    {items.map((item, idx) => {
                       const isDesignByUs = item.fileUrl === 'DESIGN_BY_US';
                       const rawFileUrl = item.fileUrl || '';
                       const hasValidFile = rawFileUrl && !rawFileUrl.includes('images.unsplash.com') && !rawFileUrl.includes('unsplash.com') && rawFileUrl !== 'DESIGN_BY_US';
                       const designUrl = (item as any).designUrl || '';
                       const isPendingApproval = (item as any).designStatus === 'CUSTOMER_REVIEW';
                       const isDesignApproved = (item as any).designStatus === 'APPROVED';
                       const isVerifying = verifyingItemId === item.id;
                       return (
                         <div key={idx} className="group relative flex flex-col items-center gap-4">
                            {/* Customer upload / design by us thumbnail */}
                            <div className={`w-40 h-40 rounded-[2rem] border-2 flex flex-col items-center justify-center transition-all overflow-hidden relative ${isDesignByUs ? 'bg-gradient-to-br from-blue-50 to-indigo-50/50 border-blue-200 text-blue-600' : 'bg-slate-50 border-dashed border-slate-200 text-slate-300 group-hover:bg-slate-100'}`}>
                               {isDesignByUs ? (
                                 <div className="flex flex-col items-center justify-center p-4 text-center select-none">
                                   <span className="text-3xl mb-2 animate-bounce">✨</span>
                                   <span className="text-[10px] font-black text-blue-900 uppercase tracking-widest leading-none">Design By Us</span>
                                   <span className="text-[8px] text-blue-700/70 font-semibold mt-2 leading-tight">Professional service active</span>
                                 </div>
                               ) : hasValidFile ? (
                                 <img src={item.fileUrl} alt="Preview" className="w-full h-full object-cover opacity-60" />
                               ) : (
                                 <>
                                   <ImageIcon size={32} strokeWidth={1} />
                                   <span className="text-[9px] font-black uppercase mt-3 tracking-widest">No Preview</span>
                                 </>
                               )}
                            </div>

                            {/* Designer uploaded design — Verification panel */}
                            {(isPendingApproval || isDesignApproved || designUrl) && (
                              <div className={`w-full rounded-2xl border-2 p-4 flex flex-col gap-3 ${
                                isPendingApproval
                                  ? 'border-amber-300 bg-amber-50'
                                  : 'border-emerald-300 bg-emerald-50'
                              }`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${
                                  isPendingApproval ? 'text-amber-700' : 'text-emerald-700'
                                }`}>
                                  {isPendingApproval ? '⏳ Designer uploaded — Please verify' : '✓ You verified this design'}
                                </p>
                                {designUrl && (
                                  <a href={designUrl} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={designUrl}
                                      alt="Designer upload preview"
                                      className="w-full max-h-48 object-contain rounded-xl border border-slate-200 bg-white cursor-zoom-in hover:opacity-80 transition-opacity"
                                    />
                                  </a>
                                )}
                                {isPendingApproval && (
                                  <button
                                    onClick={() => handleVerifyDesign(item.id)}
                                    disabled={isVerifying}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-sm"
                                  >
                                    {isVerifying ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <ShieldCheck size={14} />
                                    )}
                                    {isVerifying ? 'Verifying...' : '✔ Verify & Approve Design'}
                                  </button>
                                )}
                                {isDesignApproved && (
                                  <div className="flex items-center gap-2 text-emerald-700 text-[11px] font-black uppercase tracking-widest">
                                    <ShieldCheck size={14} /> Design approved by you
                                  </div>
                                )}
                              </div>
                            )}

                            {isDesignByUs ? (
                              <div className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100/50 tracking-widest flex items-center gap-1.5 cursor-default">
                                <span>✨</span> Design Service Active
                              </div>
                            ) : (
                              <a 
                                href={hasValidFile ? item.fileUrl : '#'} 
                                target="_blank" 
                                className={`text-[9px] font-black uppercase underline tracking-widest flex items-center gap-2 hover:text-slate-900 transition-colors ${!hasValidFile ? 'opacity-50 pointer-events-none text-slate-400' : 'text-blue-600'}`}
                              >
                                <Download size={10} /> Download Source
                              </a>
                            )}
                         </div>
                       );
                     })}
                 </div>
              </div>

              {/* Row: Financial Breakdown */}
              <div className="grid grid-cols-3">
                 <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 flex items-center">Total Amount View</div>
                 <div className="col-span-2 grid grid-cols-1 divide-y divide-slate-100 font-display">
                    <div className="flex justify-between px-8 py-4 bg-white">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Printing Cost:</span>
                      <span className="text-sm font-black text-slate-900">{fmt(order.amounts?.base)}</span>
                    </div>
                    <div className="flex justify-between px-8 py-4 bg-slate-50/20">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Membership Discount:</span>
                      <span className="text-sm font-black text-red-500">- {fmt(order.amounts?.extras < 0 ? Math.abs(order.amounts.extras) : 0)}</span>
                    </div>
                    <div className="flex justify-between px-8 py-4 bg-white">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sub Total:</span>
                      <span className="text-sm font-black text-slate-900">{fmt((order.amounts?.base || 0) + (order.amounts?.extras || 0))}</span>
                    </div>
                    <div className="flex justify-between px-8 py-4 bg-slate-50/20">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tax (GST 18%):</span>
                      <span className="text-sm font-black text-slate-900">{fmt(order.amounts?.gst)}</span>
                    </div>
                    <div className="flex justify-between px-8 py-4 bg-white">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logistics Amount:</span>
                      <span className="text-sm font-black text-slate-900">{fmt((order.amounts as any)?.transport || (order.amounts as any)?.transportCharges || (order.amounts as any)?.logistics)}</span>
                    </div>
                    <div className="flex justify-between px-8 py-4 bg-slate-50/20">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Charity / Other:</span>
                      <span className="text-sm font-black text-slate-900">₹0.00</span>
                    </div>
                    <div className="flex justify-between px-8 py-4 bg-white">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Round Off:</span>
                      <span className="text-sm font-black text-slate-900">₹0.00</span>
                    </div>
                    <div className="flex justify-between px-8 py-6 bg-slate-900 text-white rounded-b-xl border-t-2 border-slate-900">
                      <span className="text-[11px] font-black text-blue-400 uppercase tracking-widest">Total Amount Paid:</span>
                      <span className="text-2xl font-black text-blue-400 italic">{fmt(order.amounts?.grandTotal || (order as any).grandTotal)}</span>
                    </div>
                 </div>
              </div>
           </div>
        </section>

        {/* 2. ORDER STATUS HISTORY TABLE */}
        <section className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
           <div className="bg-slate-50 px-8 py-4 border-b border-slate-100 flex justify-between items-center">
             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 italic flex items-center gap-3">
               <Activity size={14} className="text-secondary" /> Transaction History / Order Status
             </h3>
           </div>
           
           <div className="overflow-x-auto">
             <table className="w-full">
               <thead>
                 <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b border-slate-100 text-center">
                   <th className="px-8 py-5 text-left">Order Status</th>
                   <th className="px-8 py-5">Delivery Choice</th>
                   <th className="px-8 py-5">Updated By</th>
                   <th className="px-8 py-5">Verified On</th>
                   <th className="px-8 py-5 text-right pr-12">Remarks</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {logs.length > 0 ? logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                       <td className="px-8 py-5 tabular-nums">
                          <span className="px-3 py-1 bg-slate-100 text-slate-900 text-[9px] font-black uppercase tracking-widest rounded-full">
                             {log.meta?.nextStatus || log.action || 'Event Logged'}
                          </span>
                       </td>
                       <td className="px-8 py-5 text-center text-xs font-bold text-slate-400 tabular-nums">{order.dispatchInfo?.method || 'N/A'}</td>
                       <td className="px-8 py-5 text-center tabular-nums">
                          <div className="flex items-center justify-center gap-3">
                             <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-black">
                                {log.userRole?.charAt(0)}
                             </div>
                             <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{log.userRole}</span>
                          </div>
                       </td>
                       <td className="px-8 py-5 text-center text-xs font-bold text-slate-500 tabular-nums">{fmtDate(log.timestamp)}</td>
                       <td className="px-8 py-5 text-right pr-12 text-[10px] font-black text-slate-400 italic tracking-tighter tabular-nums">{log.meta?.remarks || '—'}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-8 py-10 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest italic tabular-nums">
                         Initial capture complete. Log stream active.
                      </td>
                    </tr>
                  )}
               </tbody>
             </table>
           </div>
        </section>

        {/* 3. DISPATCH DETAILS TABLE */}
        <section className={`bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden transition-all duration-700 ${order.status !== 'DISPATCHED' ? 'opacity-30 blur-[2px]' : ''}`}>
           <div className="bg-slate-50 px-8 py-4 border-b border-slate-100 flex justify-between items-center">
             <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 italic flex items-center gap-3">
               <Truck size={14} className="text-secondary" /> Final Logistics Manifest
             </h3>
             {order.status !== 'DISPATCHED' && <span className="text-[9px] font-black uppercase text-amber-500 tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-100">Awaiting Dispatch</span>}
           </div>
           
           <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-2">
                 <div className="grid grid-cols-2 border-r border-slate-100">
                    <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">Delivery Type</div>
                    <div className="px-8 py-5 text-sm font-black text-slate-900 uppercase">{order.dispatchInfo?.method || 'PENDING'}</div>
                 </div>
                 <div className="grid grid-cols-2">
                    <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">Transport Name</div>
                    <div className="px-8 py-5 text-sm font-black text-slate-900 italic">{order.dispatchInfo?.transportName || '—'}</div>
                 </div>
              </div>
              <div className="grid grid-cols-2">
                 <div className="grid grid-cols-2 border-r border-slate-100">
                    <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">LR / Ref Number</div>
                    <div className="px-8 py-5 text-sm font-black text-blue-600 font-display italic tracking-widest">{order.dispatchInfo?.lrNumber || '—'}</div>
                 </div>
                 <div className="grid grid-cols-2">
                    <div className="px-8 py-5 bg-slate-50/30 text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">Dispatch Time</div>
                    <div className="px-8 py-5 text-sm font-black text-slate-900">{order.workflow?.dispatchedAt ? fmtDate(order.workflow.dispatchedAt) : '—'}</div>
                 </div>
              </div>
           </div>
        </section>
        </div>

        {/* RIGHT COLUMN: 25% Live Production Stream */}
        <div className="lg:w-1/4 space-y-8">
          <section className="bg-slate-900 rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden sticky top-8 flex flex-col h-[calc(100vh-8rem)]">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white italic flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live Production Stream
              </h3>
            </div>
            
            <div className="relative flex-1 bg-black overflow-hidden group">
               {/* Replace with actual stream/image */}
               <img 
                 src="https://images.unsplash.com/photo-1626282874430-c11ae32d2898?w=800" 
                 alt="Live Stream" 
                 className="w-full h-full object-cover opacity-60 mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-700"
               />
               <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
               
               {/* Stream HUD */}
               <div className="absolute inset-0 p-6 flex flex-col justify-between">
                 <div className="flex justify-between items-start">
                   <div className="bg-black/50 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 text-white/80 text-[9px] font-black tracking-widest uppercase flex items-center gap-2">
                     CAM_01_PRESS
                   </div>
                   <div className="bg-black/50 backdrop-blur w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-white/80">
                     <Eye size={14} />
                   </div>
                 </div>
                 
                 <div className="space-y-2">
                    <div className="flex items-center gap-2 text-white/60 text-[9px] font-bold uppercase tracking-widest">
                       <Clock size={12} className="text-secondary" /> 
                       Est. Completion: 2h 45m
                    </div>
                    <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
                       <div className="h-full bg-blue-500 w-[65%] rounded-full relative">
                         <div className="absolute inset-0 bg-white/30 animate-pulse" />
                       </div>
                    </div>
                    <div className="flex justify-between text-[8px] font-black text-white/40 uppercase tracking-[0.2em] pt-1">
                       <span>Print Initiated</span>
                       <span>Finishing</span>
                    </div>
                 </div>
               </div>
            </div>
          </section>
        </div>

      </div>
      
      {/* Footer Branding Area */}
      <div className="text-center py-20 opacity-30">
         <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 mb-6">Precision Press Intelligence System</p>
         <div className="flex items-center justify-center gap-4 text-slate-300">
            <ShieldCheck size={20} />
            <div className="w-px h-6 bg-slate-100" />
            <span className="text-[9px] font-bold uppercase tracking-widest italic">Authenticity Verified Ledger v1.0.42</span>
         </div>
      </div>

    </div>
  );
}

