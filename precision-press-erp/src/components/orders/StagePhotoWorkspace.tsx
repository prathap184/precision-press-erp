'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ExternalLink, Loader2, Play, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, limit, query, where } from '@/lib/supabase-firestore-shim';
import { useAuth } from '@/lib/auth-context';
import { Order } from '@/types/models';
import { fastCompleteProductionStage, startWorkflowStep } from '@/lib/workflow';
import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel';
import { WorkflowTimeline } from '@/components/orders/WorkflowTimeline';
import { getWorkspaceMode } from '@/lib/workspaceAccess';

interface StagePhotoWorkspaceProps {
  orderId: string;
  role: 'PASTING' | 'FINISHING';
  stageLabel: string;
  stageDescription: string;
  backHref: string;
  backLabel: string;
  dashboardHref: string;
  dashboardLabel: string;
  completionHref: string;
  proofField: 'pastingProofUrl' | 'finishingProofUrl';
  photoOptional?: boolean;
}

export function StagePhotoWorkspace({
  orderId,
  role,
  stageLabel,
  stageDescription,
  backHref,
  backLabel,
  dashboardHref,
  dashboardLabel,
  completionHref,
  proofField,
  photoOptional = false,
}: StagePhotoWorkspaceProps) {
  const { profile } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setPhotoError(null);

      try {
        let resolvedOrder: Order | null = null;

        try {
          const directSnap = await getDoc(doc(db, 'orders', orderId));
          if (directSnap.exists()) {
            resolvedOrder = { id: directSnap.id, ...directSnap.data() } as Order;
          }
        } catch (err) {
          console.error(`Failed direct ${role.toLowerCase()} order lookup:`, err);
        }

        if (!resolvedOrder) {
          const fallbackSnap = await getDocs(query(collection(db, 'orders'), where('id', '==', orderId), limit(1)));
          if (!fallbackSnap.empty) {
            const docSnap = fallbackSnap.docs[0];
            resolvedOrder = { id: docSnap.id, ...docSnap.data() } as Order;
          }
        }

        if (cancelled) return;

        if (!resolvedOrder) {
          setOrder(null);
          setLoading(false);
          return;
        }

        setOrder(resolvedOrder);
      } catch (err) {
        console.error(`Failed to load ${role.toLowerCase()} order:`, err);
        if (!cancelled) {
          setOrder(null);
          setPhotoError('Unable to load this order.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, role]);

  useEffect(() => {
    if (!order) return;
    const existing = (order.workflow as any)?.[proofField] || (order.workflow as any)?.stageProofUrl || '';
    setPhotoUrl(typeof existing === 'string' ? existing : '');
  }, [order, proofField]);

  const currentStep = order?.workflowSnapshot?.steps?.[order.workflowSnapshot?.currentStepIndex ?? -1];
  const mode = getWorkspaceMode(role, order?.workflowSnapshot);

  const handlePhotoUpload = async (file: File) => {
    setPhotoUploading(true);
    setPhotoError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderId', orderId);
      formData.append('folder', `${role.toLowerCase()}_proofs/${orderId}`);

      const response = await fetch('/api/designs/upload', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.fileUrl) {
        throw new Error(payload.error || 'Upload failed');
      }

      setPhotoUrl(payload.fileUrl);
      toast.success('Stage photo uploaded.');
    } catch (err: any) {
      console.error('Stage photo upload failed:', err);
      setPhotoError(err.message || 'Failed to upload photo.');
      toast.error(err.message || 'Failed to upload photo.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleWorkDone = async () => {
    if (!order || processing || isCompleted) return;
    if (!photoOptional && !photoUrl) {
      toast.error('Upload the photo before marking work done.');
      return;
    }

    setProcessing(true);
    try {
      if (currentStep?.status === 'PENDING' || currentStep?.status === 'PAUSED' || currentStep?.status === 'ON_HOLD') {
        await startWorkflowStep(order.id, `Started from ${stageLabel} Work Done shortcut`);
      }

      const metadata = {
        [`workflow.${proofField}`]: photoUrl,
        [`workflow.${proofField}UploadedAt`]: new Date().toISOString(),
        [`workflow.${proofField}UploadedBy`]: profile?.uid || profile?.email || '',
      } as Record<string, any>;

      await fastCompleteProductionStage(order.id, `${stageLabel} marked complete`, metadata);
      setIsCompleted(true);
      toast.success(`${stageLabel} work completed.`);
      const returnTo = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
      try {
        const url = new URL(returnTo || completionHref || '/admin/orders', window.location.origin);
        if (order?.id) {
          if (url.pathname.includes('/orders')) {
            url.searchParams.set('highlight', order.id);
          } else {
            url.searchParams.set('orderId', order.id);
          }
        }
        setTimeout(() => router.push(url.pathname + url.search), 700);
      } catch (e) {
        setTimeout(() => router.push(returnTo || completionHref || '/admin/orders'), 700);
      }
    } catch (err) {
      console.error(`${stageLabel} work done failed:`, err);
      toast.error(`Failed to complete ${stageLabel.toLowerCase()} work.`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="mx-auto animate-spin text-blue-500" size={40} />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500/40">Loading {stageLabel.toLowerCase()} order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
        <div className="max-w-md space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Upload size={28} />
          </div>
          <div className="space-y-2">
            <h1 className="text-[28px] font-bold font-black tracking-tight text-slate-900">{stageLabel} Order Not Available</h1>
            <p className="text-sm text-slate-500">{photoError || 'This order could not be loaded.'}</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Link href={backHref} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-700 transition-colors hover:bg-slate-50">
              {backLabel}
            </Link>
            <Link href={dashboardHref} className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-blue-700">
              {dashboardLabel}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-6">
      {mode === 'READ_ONLY' && (
        <div className="rounded-3xl border border-blue-200 bg-blue-50/50 p-5 flex items-start gap-3 shadow-md">
          <span className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0 mt-0.5">
            <span className="material-symbols-outlined text-lg leading-none">visibility</span>
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600">Read Only Mode</p>
            <p className="text-[14px] font-bold text-blue-900 mt-1">This stage has already been completed.</p>
            <p className="text-[12px] text-blue-700/80 mt-0.5 font-medium">Uploads and workflow actions are disabled for this stage.</p>
          </div>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 md:p-6 flex flex-col gap-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600">{stageLabel}</p>
              <h1 className="mt-2 text-[28px] font-bold font-black tracking-tight text-slate-900 truncate">
                Order #{order.id.replace('ORD-', '')} {order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Unknown Customer'}
              </h1>
              <p className="mt-2 text-sm text-slate-500 max-w-2xl">{stageDescription}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                  {order.status}
                </span>
                {currentStep?.label && (
                  <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
                    Current: {currentStep.label}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <Link href={backHref} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50">
                {backLabel}
              </Link>
              <button
                type="button"
                onClick={handleWorkDone}
                disabled={processing || (!photoOptional && !photoUrl) || photoUploading || mode === 'READ_ONLY'}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition-all ${
                  mode === 'READ_ONLY' || isCompleted ? 'bg-slate-200 text-slate-500 cursor-not-allowed border-slate-300 opacity-80' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                }`}
              >
                {processing ? <Loader2 className="animate-spin" size={14} /> : mode === 'READ_ONLY' ? <CheckCircle size={14} className="text-slate-400" /> : isCompleted ? <CheckCircle size={14} /> : <Play size={14} />}
                {mode === 'READ_ONLY' ? 'Already Completed' : isCompleted ? 'Completed' : 'Work Done'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Upload Photo</p>
              <label className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-white px-4 py-6 text-sm font-bold text-slate-700 transition-colors ${
                mode === 'READ_ONLY'
                  ? 'border-slate-300 bg-slate-100/50 cursor-not-allowed opacity-75'
                  : 'border-blue-200 hover:bg-blue-50 cursor-pointer'
              }`}>
                <Upload size={16} />
                {photoUploading ? 'Uploading...' : mode === 'READ_ONLY' ? 'Uploads disabled (completed)' : 'Choose stage photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={photoUploading || mode === 'READ_ONLY'}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePhotoUpload(file);
                  }}
                />
              </label>
              {photoError && <p className="text-xs font-bold text-red-600">{photoError}</p>}
              {photoUrl && (
                <a href={photoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-700 hover:underline">
                  <ExternalLink size={12} />
                  Open uploaded photo
                </a>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Stage Requirement</p>
              <p className="text-sm font-semibold text-slate-700">
                {photoOptional ? 'You can optionally upload a stage photo before pressing Work Done to complete this stage.' : 'Upload the stage photo first, then press Work Done to move the order forward.'}
              </p>
              <p className="text-[11px] text-slate-500">Role: {role}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Production Timeline ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm p-6">
        <WorkflowTimeline orderId={orderId} />
      </div>

      {/* ── Full Booking Details ── */}
      <OrderDetailsPanel order={order} role={role} />
    </div>
  );
}
