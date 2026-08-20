'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ExternalLink, Loader2, Play, Upload, Eye } from 'lucide-react';
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
    <div className="w-full font-sans text-slate-800 bg-[#d4d4d8] p-4 sm:p-6 md:p-8 relative z-10 min-h-[calc(100vh-4rem)] pb-12">
      {/* Exact Proxy Order Canvas Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-400/35 blur-[140px] pointer-events-none animate-pulse"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-sky-400/35 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-300/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      {/* Page Content Stream (Modular Standalone Cards) */}
      <div className="relative z-10 w-full space-y-6">
        {/* Header Panel (Bold Command Headline) */}
        <section className="w-full">
          <div className="flex flex-row items-center justify-between gap-4 flex-wrap md:flex-nowrap px-2 sm:px-3 md:px-4">
            <div className="flex flex-row items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-[28px] font-black tracking-tight text-slate-900 truncate">
                    Order #{order.id.replace('ORD-', '')} — {order.customerSnapshot?.displayName || order.customerSnapshot?.name || 'Unknown Customer'}
                  </h1>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/70 backdrop-blur-md px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-700 shadow-2xs">
                      {order.status}
                    </span>
                    {currentStep?.label && (
                      <span className="inline-flex items-center rounded-full border border-purple-200/80 bg-purple-50/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-purple-700 shadow-2xs">
                        Step: {currentStep.label}
                      </span>
                    )}
                    {mode === 'READ_ONLY' && (
                      <span className="inline-flex items-center rounded-full border border-blue-200/80 bg-blue-50/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-blue-700 shadow-2xs">
                        • Read Only
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-1">
                  Placed on {order.createdAt ? new Date((order.createdAt as any).seconds ? (order.createdAt as any).seconds * 1000 : order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'} • {order.customerSnapshot?.companyName || 'Hindustan Enterprises'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Link href={backHref} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 backdrop-blur-md px-4 h-9 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-white hover:shadow-sm transition-all duration-200">
                {backLabel}
              </Link>
              <button
                type="button"
                onClick={handleWorkDone}
                disabled={processing || (!photoOptional && !photoUrl) || photoUploading || mode === 'READ_ONLY'}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-5 h-9 text-[10px] font-black uppercase tracking-widest text-white transition-all shadow duration-200 ${
                  mode === 'READ_ONLY' || isCompleted ? 'bg-slate-200 text-slate-500 cursor-not-allowed border-slate-300 opacity-80' : 'bg-slate-900 hover:bg-slate-800 disabled:opacity-50'
                }`}
              >
                {processing ? <Loader2 className="animate-spin" size={12} /> : mode === 'READ_ONLY' ? <CheckCircle size={12} className="text-slate-400" /> : isCompleted ? <CheckCircle size={12} /> : <Play size={12} />}
                {mode === 'READ_ONLY' ? 'Already Completed' : isCompleted ? 'Completed' : 'Work Done'}
              </button>
            </div>
          </div>
        </section>

        {/* Read Only Mode Banner */}
        {mode === 'READ_ONLY' && (
          <div className="w-full rounded-[2rem] bg-blue-500/10 border border-blue-400/30 backdrop-blur-xl p-4 flex items-center gap-3.5 shadow-2xs">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-800 shrink-0">
              <Eye size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-700">Read Only Mode</span>
                <span className="text-[10px] font-bold text-slate-500">•</span>
                <span className="text-xs font-black text-slate-900">This stage has already been completed.</span>
              </div>
              <p className="text-[11px] font-bold text-slate-600 mt-0.5">Uploads and workflow actions are disabled for this stage.</p>
            </div>
          </div>
        )}

        {/* ── Full Booking Details (OrderDetailsPanel at top) ── */}
        <OrderDetailsPanel order={order} role={role} className="text-slate-800 w-full" />

        {/* ── Stage Action Card (Photo Proof Upload) ── */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80">
            <span className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
              <Upload size={16} />
            </span>
            <div>
              <h4 className="text-xs font-black text-slate-900 tracking-tight uppercase">{stageLabel} Proof Photo</h4>
              <p className="text-[10px] text-slate-600 font-bold italic mt-0.5">{stageDescription}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
            <div className="space-y-3">
              <label className={`flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-xs font-black uppercase tracking-wider transition-all shadow-2xs ${
                mode === 'READ_ONLY'
                  ? 'border-white/40 bg-white/10 cursor-not-allowed opacity-60 text-slate-500'
                  : 'border-white/60 bg-white/40 hover:bg-white/70 hover:border-white/90 text-slate-800 cursor-pointer backdrop-blur-md'
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
                <div className="p-3 rounded-2xl bg-white/80 border border-slate-200 shadow-sm space-y-2">
                  <div className="relative rounded-xl overflow-hidden bg-slate-100 max-h-60 flex items-center justify-center border border-slate-200">
                    <img 
                      src={photoUrl} 
                      alt={`${stageLabel} Proof`} 
                      className="max-h-60 w-full object-contain rounded-xl"
                    />
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">✓ Stage Proof Attached</span>
                    <a href={photoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-black text-blue-700 hover:underline">
                      <ExternalLink size={12} /> View Full Photo
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/70 backdrop-blur-md p-5 space-y-2 shadow-2xs">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Stage Requirement</p>
              <p className="text-xs font-bold text-slate-800">
                {photoOptional ? 'You can optionally upload a stage photo before pressing Work Done to complete this stage.' : 'Upload the stage photo first, then press Work Done to move the order forward.'}
              </p>
              <p className="text-[10px] text-indigo-700 font-black uppercase tracking-wider">Role: {role}</p>
            </div>
          </div>
        </div>

        {/* ── Production Timeline ── */}
        <div className="w-full rounded-[2rem] bg-white/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
          <WorkflowTimeline orderId={orderId} />
        </div>
      </div>
    </div>
  );
}
