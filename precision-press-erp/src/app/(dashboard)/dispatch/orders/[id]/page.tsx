'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  Package, Truck, CheckCircle, Loader2, Upload,
  ArrowLeft, AlertCircle
} from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, limit, onSnapshot, query, where } from '@/lib/supabase-firestore-shim';
import { Order } from '@/types/models';
import { dispatchOrder } from '@/lib/workflow';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { WorkflowTimeline } from '@/components/orders/WorkflowTimeline';
import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel';

function InputField({ label, value, onChange, type = 'text', placeholder, required = false }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all bg-white"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export default function DispatchFinalizationPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const id = (params?.id || params?.orderId) as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = React.useRef(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Delivery Proof
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState('');

  // Transport form fields
  const [form, setForm] = useState({
    transporter_name: '',
    dispatch_through: '',
    lr_number: '',
    lr_date: '',
    vehicle_number: '',
    destination: '',
    delivery_note: '',
    delivery_note_date: '',
    notes: '',
  });

  const setF = (field: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  useEffect(() => {
    if (!id) return;
    let unsub: (() => void) | undefined;
    const ref = doc(db, 'orders', id);
    unsub = onSnapshot(ref, async snap => {
      if (!snap.exists()) {
        try {
          const q = query(collection(db, 'orders'), where('id', '==', id), limit(1));
          const qs = await getDocs(q);
          if (qs.docs.length > 0) setOrder({ id: qs.docs[0].id, ...(qs.docs[0].data() as any) } as Order);
          else setOrder(null);
        } catch { setOrder(null); }
      } else {
        setOrder({ id: snap.id, ...(snap.data() as any) } as Order);
      }
      setLoading(false);
    }, () => setLoading(false));

    return () => { if (unsub) unsub(); };
  }, [id]);

  // Pre-fill form from existing dispatch details
  useEffect(() => {
    if (!order) return;
    if (order.dispatchInfo?.transportName) setF('transporter_name', order.dispatchInfo.transportName);
    if (order.dispatchInfo?.lrNumber) setF('lr_number', order.dispatchInfo.lrNumber);
    if (order.delivery?.address) setF('destination', order.delivery.address);

    const loadDetails = async () => {
      const { data: dispatch } = await supabase
        .from('dispatch_details')
        .select('*')
        .eq('parent_order_id', order.id)
        .single();

      if (dispatch) {
        setForm({
          transporter_name: dispatch.transporter_name || '',
          dispatch_through: dispatch.dispatch_through || '',
          lr_number: dispatch.lr_number || '',
          lr_date: dispatch.lr_date || '',
          vehicle_number: dispatch.vehicle_number || '',
          destination: dispatch.destination || '',
          delivery_note: dispatch.delivery_note || '',
          delivery_note_date: dispatch.delivery_note_date || '',
          notes: '',
        });
      }
    };
    loadDetails();
  }, [order]);

  const handleProofUpload = async (file: File) => {
    setProofUploading(true);
    setProofError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/designs/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Upload failed');
      setProofUrl(data.fileUrl);
    } catch (err: any) {
      setProofError(err.message || 'Upload failed');
    } finally {
      setProofUploading(false);
    }
  };

  const handleCompleteDispatch = async () => {
    if (!order) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');

    try {
      // 1. Save dispatch details
      const dispatchPayload = {
        parent_order_id: order.id,
        transporter_name: form.transporter_name || null,
        dispatch_through: form.dispatch_through || null,
        lr_number: form.lr_number || null,
        lr_date: form.lr_date || null,
        vehicle_number: form.vehicle_number || null,
        destination: form.destination || null,
        delivery_note: form.delivery_note || null,
        delivery_note_date: form.delivery_note_date || null,
        created_by: user?.uid || null,
        updated_at: new Date().toISOString(),
      };

      const { error: dbErr } = await supabase
        .from('dispatch_details')
        .upsert(dispatchPayload, { onConflict: 'parent_order_id' });
      if (dbErr) throw dbErr;

      // 2. Mark order as DISPATCHED via workflow
      const method = order.delivery?.choice || 'PICKUP';
      const result = await dispatchOrder(order.id, {
        method: method === 'PICKUP' ? 'PICKUP' : method === 'DOOR_DELIVERY' ? 'DOOR_DELIVERY' : method === 'COURIER' ? 'COURIER' : 'TRANSPORT',
        transportName: form.transporter_name,
        lrNumber: form.lr_number,
        notes: form.notes,
        dispatchProofUrl: proofUrl || undefined,
      });
      if (!result?.success) throw new Error('Dispatch workflow failed');

      setSuccess(true);
      setTimeout(() => {
        const returnTo = searchParams.get('returnTo');
        router.push(returnTo || '/dispatch');
      }, 2000);

    } catch (err: any) {
      submittingRef.current = false;
      setError(err.message || 'Failed to complete dispatch. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
    </div>
  );

  if (!order) return (
    <div className="p-8 text-center">
      <p className="text-slate-500 font-bold">Order not found.</p>
      <button onClick={() => router.back()} className="mt-4 text-indigo-600 font-bold text-sm underline">Go Back</button>
    </div>
  );

  if (success) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>
      <h2 className="text-xl font-black text-green-700 uppercase tracking-tight">Dispatch Complete!</h2>
      <p className="text-slate-500 font-medium text-center max-w-sm">
        Order dispatched successfully. Go to the <strong>Invoice Generation</strong> module to generate an invoice when the customer collects their items.
      </p>
      <p className="text-xs text-slate-400">Redirecting…</p>
    </div>
  );

  const dispatchStep = order?.workflowSnapshot?.steps?.find((s) => s.role === 'DISPATCH');
  const isAlreadyDispatched = Boolean(order && (['DISPATCHED', 'IN_TRANSIT', 'DELIVERED'].includes(order.status) || dispatchStep?.status === 'COMPLETED'));

  const dispatchProofUrl = (order?.workflow as any)?.dispatchProofUrl || null;
  const customerName = order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Customer';

  return (
    <RoleGuard allowedRoles={['DISPATCH', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']}>
      <div className="max-w-3xl mx-auto space-y-6 pb-12">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors">
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em]">Dispatch Finalization</p>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Complete Dispatch</h1>
          </div>
        </div>

        {/* Order Summary Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white flex-shrink-0">
              <Package size={22} />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{order.id}</p>
                  <h2 className="text-lg font-black text-slate-900 mt-0.5">{customerName}</h2>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  order.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {order.paymentStatus || 'PENDING'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grand Total</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5">₹{(order.amounts?.grandTotal || 0).toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Items</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5">{order.items?.length || 1}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5">{order.delivery?.choice || 'PICKUP'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transport Details */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <Truck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Transport Details</h3>
              <p className="text-[10px] text-slate-400 font-medium">Optional transport and logistics information</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Transporter Name" value={form.transporter_name} onChange={v => setF('transporter_name', v)} placeholder="e.g. BlueDart" />
            <InputField label="Dispatch Through" value={form.dispatch_through} onChange={v => setF('dispatch_through', v)} placeholder="e.g. Road / Air / Train" />
            <InputField label="LR Number" value={form.lr_number} onChange={v => setF('lr_number', v)} placeholder="LR12345678" />
            <InputField label="LR Date" value={form.lr_date} onChange={v => setF('lr_date', v)} type="date" />
            <InputField label="Vehicle Number" value={form.vehicle_number} onChange={v => setF('vehicle_number', v)} placeholder="KA-09-AB-1234" />
            <InputField label="Destination" value={form.destination} onChange={v => setF('destination', v)} placeholder="Mysore" />
            <InputField label="Delivery Note Number" value={form.delivery_note} onChange={v => setF('delivery_note', v)} placeholder="DN-001" />
            <InputField label="Delivery Note Date" value={form.delivery_note_date} onChange={v => setF('delivery_note_date', v)} type="date" />
          </div>
        </div>

        {/* Delivery Proof (optional) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
              <Upload size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Dispatch Proof</h3>
              <p className="text-[10px] text-slate-400 font-medium">Optional – upload a photo proof of dispatch</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 transition-colors">
              {proofUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {proofUploading ? 'Uploading…' : proofUrl || dispatchProofUrl ? 'Replace Photo' : 'Upload Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleProofUpload(f); }} disabled={proofUploading} />
            </label>
            {proofError && <p className="text-xs text-red-500">{proofError}</p>}
          </div>
          {(proofUrl || dispatchProofUrl) && (
            <img src={proofUrl || dispatchProofUrl || ''} alt="" className="rounded-xl border border-slate-200 max-h-40 object-contain" />
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Previous Workspaces / Timeline */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Production Timeline</h3>
          <WorkflowTimeline orderId={order.id} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Booking Details</h3>
          <OrderDetailsPanel order={order} role="DISPATCH" />
        </div>

        {/* Submit Button or Already Dispatched Message */}
        {isAlreadyDispatched ? (
          <div className="rounded-3xl border border-green-200 bg-green-50 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                <CheckCircle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-green-700 uppercase tracking-widest">Already Dispatched</h3>
                <p className="text-sm text-green-600">This order has been marked dispatched. No further dispatch actions are required.</p>
              </div>
            </div>
            {dispatchProofUrl && (
              <div className="mt-4 rounded-2xl overflow-hidden border border-green-200 shadow-sm max-w-sm">
                <img
                  src={dispatchProofUrl}
                  alt="Dispatch proof"
                  className="w-full object-cover"
                />
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleCompleteDispatch}
            disabled={submitting}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
            {submitting ? 'Completing Dispatch…' : 'Complete Dispatch'}
          </button>
        )}

      </div>
    </RoleGuard>
  );
}
