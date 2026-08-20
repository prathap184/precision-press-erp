'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from '@/lib/supabase-firestore-shim';
import { ArrowRight, CheckCircle, Loader2, Upload, Truck } from 'lucide-react';
import { db } from '@/lib/firebase';
import { Order } from '@/types/models';
import { RoleGuard } from '@/lib/role-guard';
import { getDeliveryProofMeta, getDeliveryProofUrl } from '@/lib/order-proof';
import { startWorkflowStep, deliverOrder } from '@/lib/workflow';
import { OrderThumbnail } from '@/components/orders/OrderThumbnail';
import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel';
import { WorkflowTimeline } from '@/components/orders/WorkflowTimeline';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';

function formatDate(value: any) {
  if (!value) return '—';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function DeliveryOrderActionPanel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'START' | 'DELIVER' | null>(null);
  const [notes, setNotes] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const ref = doc(db, 'orders', orderId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setOrder(null);
        setLoading(false);
        return;
      }

      setOrder({ id: snap.id, ...(snap.data() as any) } as Order);
      setLoading(false);
    }, (error) => {
      console.error('Failed to load delivery order:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [orderId]);

  const deliveryStep = useMemo(() => {
    return order?.workflowSnapshot?.steps?.find((step) => step.role === 'DELIVERY') || null;
  }, [order]);

  const deliveryProofMeta = getDeliveryProofMeta(order);
  const deliveryProofUrl = proofUrl || getDeliveryProofUrl(order);
  const invalidProofMessage = deliveryProofMeta?.url && !deliveryProofUrl
    ? 'Existing proof is stored as a local file path and cannot be displayed here. Please upload a new delivery image.'
    : null;
  const isAlreadyDelivered = Boolean(order && (order.status === 'DELIVERED' || deliveryStep?.status === 'COMPLETED'));

  const canStartDelivery = Boolean(order && deliveryStep && ['PENDING', 'ON_HOLD', 'PAUSED', 'IN_PROGRESS'].includes(deliveryStep.status) && !isAlreadyDelivered);
  const canDeliver = Boolean(order && deliveryProofUrl && !isAlreadyDelivered);

  const handleStartDelivery = async () => {
    if (!order) return;
    setActionLoading('START');
    try {
      await startWorkflowStep(order.id, notes || 'Delivery started');
      toast.success('Delivery stage started');
    } catch (error: any) {
      console.error('Failed to start delivery:', error);
      toast.error(error?.message || 'Failed to start delivery.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleProofUpload = async (file: File) => {
    if (!order) return;
    setProofUploading(true);
    setProofError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderId', order.id);

      const res = await fetch('/api/designs/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Upload failed');
      }

      const data = await res.json().catch(() => ({}));
      if (!data.success) throw new Error(data.error || 'Upload failed');
      setProofUrl(data.fileUrl);
      toast.success('Delivery proof photo uploaded');
    } catch (error: any) {
      console.error('Proof upload failed:', error);
      setProofError(error?.message || 'Failed to upload delivery image.');
      toast.error(error?.message || 'Failed to upload delivery image.');
    } finally {
      setProofUploading(false);
    }
  };

  const handleDeliveredToCustomer = async () => {
    if (!order) return;

    const finalProof = proofUrl || deliveryProofUrl || undefined;
    if (!finalProof) {
      toast.error('Please upload a delivery image before marking this order delivered.');
      return;
    }

    setActionLoading('DELIVER');
    try {
      const res = await deliverOrder(order.id, notes || 'Delivered to customer', finalProof);
      if (res && res.success) {
        setProofUrl(null);
        setProofError(null);
        toast.success('Order marked as delivered successfully.');
        const returnTo = searchParams.get('returnTo');
        setTimeout(() => {
          router.push(returnTo || '/admin/orders');
        }, 800);
        return;
      }
      throw new Error('Delivery action unsuccessful');
    } catch (error: any) {
      console.error('Failed to complete delivery:', error);
      toast.error(error?.message || 'Failed to mark order delivered.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Select a delivery-stage order to manage it</p>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['DELIVERY', 'ADMIN', 'MANAGER']} redirectTo="/delivarypartner">
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center overflow-hidden">
              <OrderThumbnail orderId={order.id} order={order as any} size="sm" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Delivery Order</p>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">Order #{order.id.replace('ORD-', '')}</h2>
              <p className="text-sm text-slate-500 font-medium">{order.customerSnapshot?.name || 'Guest'} · {order.customerSnapshot?.phone || 'No phone'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
              <Truck size={12} />
              {order.status || 'DELIVERY'}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[10px] font-black uppercase tracking-widest">
              {deliveryStep?.status || 'PENDING'}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Stage</p>
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest">{deliveryStep?.label || 'Delivery'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Started</p>
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest">{formatDate(deliveryStep?.startedAt)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Completed</p>
              <p className="text-sm font-black text-slate-900 uppercase tracking-widest">{formatDate(deliveryStep?.completedAt)}</p>
            </div>
          </div>
          {isAlreadyDelivered ? (
            <div className="rounded-3xl border border-green-200 bg-green-50 p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-green-700 uppercase tracking-widest">Already Delivered</h3>
                  <p className="text-sm text-green-600">This order has been marked delivered. No further delivery actions are required.</p>
                  {deliveryProofMeta?.uploadedAt && (
                    <p className="text-xs text-green-500 mt-2">Completed on {formatDate(deliveryProofMeta.uploadedAt)}</p>
                  )}
                </div>
              </div>
              {deliveryProofUrl && (
                <div className="mt-4 rounded-2xl overflow-hidden border border-green-200 shadow-sm max-w-sm">
                  <img
                    src={deliveryProofUrl}
                    alt="Delivery proof"
                    className="w-full object-cover"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-3xl border border-slate-200 p-5 space-y-4">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em]">Start Delivery</h3>
              <p className="text-sm text-slate-500">Mark this order as in progress before leaving for customer handover.</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
                placeholder="Optional delivery notes"
              />
              <button
                onClick={handleStartDelivery}
                disabled={!canStartDelivery || actionLoading === 'START'}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black uppercase tracking-widest text-white disabled:opacity-50"
              >
                {actionLoading === 'START' ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                Start Delivery
              </button>
            </div>

            <div className="rounded-3xl border border-slate-200 p-5 space-y-4">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em]">Delivered to Customers</h3>
              <p className="text-sm text-slate-500">Upload the handover image first. Delivery cannot be completed without a proof photo.</p>

              <label className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-slate-900 transition-colors">
                <Upload size={16} />
                {proofUrl || deliveryProofUrl ? 'Replace delivery image' : 'Upload delivery image'}
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
                  <Loader2 className="animate-spin" size={16} /> Uploading delivery image...
                </div>
              )}

              {invalidProofMessage && (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  {invalidProofMessage}
                </div>
              )}

              {deliveryProofUrl && (
                <div className="rounded-3xl overflow-hidden border border-slate-200">
                  <img
                    src={deliveryProofUrl}
                    alt="Delivery proof"
                    className="w-full object-cover max-h-72"
                  />
                </div>
              )}

              {proofError && <p className="text-sm text-red-600">{proofError}</p>}

              <button
                onClick={handleDeliveredToCustomer}
                disabled={!canDeliver || actionLoading === 'DELIVER'}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black uppercase tracking-widest text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors"
              >
                {actionLoading === 'DELIVER' ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                Delivered to Customers
              </button>
            </div>
          </div>
          )}
        </div>
        </div>
        
        {/* ── Production Timeline ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <WorkflowTimeline orderId={orderId} />
        </div>

        {/* ── Full Booking Details ── */}
        <OrderDetailsPanel order={order} role="DELIVERY" />
      </div>
    </RoleGuard>
  );
}
