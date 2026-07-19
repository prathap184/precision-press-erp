'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { getQuotationById, acceptQuotation } from '@/lib/actions/quotations';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveUser } from '@/lib/impersonation-context';
import {
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

export default function QuotationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const quotationId = params?.id as string;
  const { profile } = useAuth();
  const { effectiveUserId } = useEffectiveUser(profile?.uid);

  const [quotation, setQuotation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!effectiveUserId || !quotationId) return;

    const fetchQuotation = async () => {
      setLoading(true);
      try {
        const data = await getQuotationById(quotationId, effectiveUserId);
        if (data) {
          if (typeof data.items === 'string') data.items = JSON.parse(data.items);
          if (typeof data.tax_details === 'string') data.tax_details = JSON.parse(data.tax_details);
          if (typeof data.customer_snapshot === 'string') data.customer_snapshot = JSON.parse(data.customer_snapshot);
          setQuotation(data);
        } else {
          setQuotation(null);
        }
      } catch (err) {
        console.error('Failed to fetch quotation:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuotation();
  }, [quotationId, effectiveUserId]);

  const handleAccept = async () => {
    startTransition(async () => {
      try {
        const result = await acceptQuotation(quotationId, effectiveUserId!);
        if (result.success) {
          toast.success('Quotation accepted successfully!');
          setQuotation((prev: any) => ({ ...prev, status: 'ACCEPTED' }));
          
          setTimeout(() => {
            router.push('/dashboard/quotations');
          }, 1500);
        } else {
          toast.error(result.error || 'Failed to accept quotation');
        }
      } catch (err: any) {
        toast.error(err.message || 'An error occurred');
      }
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-slate-500" size={40} />
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-bold text-slate-900">Quotation Not Found</h2>
        <Link href="/dashboard/quotations" className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
          Back to Quotations
        </Link>
      </div>
    );
  }

  const isAccepted = quotation.status === 'ACCEPTED';
  const isOrdered = quotation.status === 'ORDERED';
  const customer = quotation.customer_snapshot || {};
  const currentImage = 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&w=1200';

  return (
    <div className="font-sans text-slate-800 bg-[#d4d4d8] -m-4 p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8 relative z-10 min-h-[calc(100vh-4rem)] rounded-none overflow-hidden">
      
      <div className="mb-4">
        <Link href="/dashboard/quotations" className="inline-flex items-center text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors bg-white/50 px-4 py-2 rounded-xl border border-white/60 shadow-[0_4px_10px_rgb(0,0,0,0.02)] backdrop-blur-md">
          <ChevronLeft size={14} className="mr-1" />
          Back to List
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold font-black tracking-tight text-slate-900">Quotation Terminal</h1>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Hindustan Enterprises</p>
        </div>
      </div>

      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
        
        {/* Abstract Shapes */}
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-400/40 blur-[140px] pointer-events-none animate-pulse"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-fuchsia-400/40 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-400/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="flex flex-col gap-6 relative z-10 w-full">
        
        {/* Top Row: Image, Customer */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1.5fr_3fr] items-stretch">
          {/* Image Card */}
          <div className="relative z-10 rounded-[2rem] bg-white/50 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col justify-center min-h-[160px]">
            <div className="w-full h-full rounded-[1.5rem] overflow-hidden relative bg-white">
              <img src={currentImage} className="absolute inset-0 w-full h-full object-cover" alt="Quotation Header" />
            </div>
          </div>

          {/* Customer Card */}
          <div className="relative z-50 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer Details</h3>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isAccepted ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                {quotation.status}
              </span>
            </div>
            
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
              <div className="text-sm font-bold text-slate-800 mb-1">{customer.name || customer.displayName}</div>
              <div className="text-xs text-slate-500">{customer.phone} {customer.email && `• ${customer.email}`}</div>
              {customer.address && (
                <div className="mt-2 text-xs text-slate-600">{customer.address}</div>
              )}
            </div>
          </div>
        </div>

        {/* Middle Row: Items Card */}
        <div className="w-full mt-2 mb-2">
          <div className="relative z-10 w-full rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</h3>
              <span className="text-xs font-black text-slate-400">{quotation.quotation_number}</span>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead>
                  <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="py-3 px-2 w-8 text-center">#</th>
                    <th className="py-3 px-2">Name of Item</th>
                    <th className="py-3 px-2">Project</th>
                    <th className="py-3 px-2 text-center">GST%</th>
                    <th className="py-3 px-2">Size</th>
                    <th className="py-3 px-2 text-center">Sq.Ft.</th>
                    <th className="py-3 px-2 text-center">Qty</th>
                    <th className="py-3 px-2">Rate/Sft</th>
                    <th className="py-3 px-2 text-center">Rate Per</th>
                    <th className="py-3 px-2">Finish</th>
                    <th className="py-3 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {quotation.items?.map((item: any, index: number) => {
                    const wFt = item.widthUnit === 'IN' ? item.width / 12 : item.width;
                    const hFt = item.heightUnit === 'IN' ? item.height / 12 : item.height;
                    const sqft = wFt * hFt;
                    const tax = item.pricingSnapshot?.tax || 0.18;
                    
                    return (
                      <tr key={index} className="group transition-colors hover:bg-slate-50/50">
                        <td className="py-3 px-2 text-center text-xs font-bold text-slate-400 tabular-nums">{index + 1}</td>
                        <td className="py-3 px-2 text-xs font-bold text-slate-700">{item.productName}</td>
                        <td className="py-3 px-2 text-xs font-bold text-slate-600">{item.projectName || '—'}</td>
                        <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">{tax * 100}%</td>
                        <td className="py-3 px-2 text-xs font-bold text-slate-700 tabular-nums">
                          {item.width} {item.widthUnit} × {item.height} {item.heightUnit}
                        </td>
                        <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">
                          {sqft > 0 ? sqft.toFixed(2) : '—'}
                        </td>
                        <td className="py-3 px-2 text-center text-xs font-bold text-slate-800 tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-2 text-xs font-bold text-slate-600 tabular-nums">
                          {item.pricingSnapshot?.baseRate?.toFixed(2) || item.rate?.toFixed(2) || '—'}
                        </td>
                        <td className="py-3 px-2 text-center text-xs font-bold text-slate-700 tabular-nums">
                          {item.pricingSnapshot?.baseRate ? (sqft * item.pricingSnapshot.baseRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                        <td className="py-3 px-2 text-xs font-bold text-slate-600">
                          {item.eyeletType && item.eyeletType !== 'NONE' ? item.eyeletType : 'None'}
                        </td>
                        <td className="py-3 px-2 text-right text-sm font-black text-slate-900 tabular-nums">
                          {Number(item.subTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bottom Row: Payment Terminal */}
        <div className="grid gap-6 lg:grid-cols-12 mb-12">
          <div className="lg:col-span-5 lg:col-start-8">
            <div className="rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
              <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Payment Summary</h3>
              
              <div className="space-y-3 mb-6">
                {quotation.items?.map((item: any, idx: number) => {
                  const baseAmount = item.pricingSnapshot?.baseRate ? (
                    (item.widthUnit === 'IN' ? item.width / 12 : item.width) * 
                    (item.heightUnit === 'IN' ? item.height / 12 : item.height) * 
                    item.quantity * item.pricingSnapshot.baseRate
                  ) : item.subTotal;
                  
                  const finishAmount = item.eyeletType !== 'NONE' && item.pricingSnapshot?.eyeletRate ? (
                    item.quantity * item.pricingSnapshot.eyeletRate
                  ) : 0;

                  const taxRate = item.pricingSnapshot?.tax || 0.18;
                  const itemGst = (baseAmount + finishAmount) * taxRate;
                  
                  return (
                    <div key={idx} className="pb-2 border-b border-slate-100/50">
                      <div className="flex justify-between text-sm font-semibold text-slate-700">
                        <span className="truncate pr-4">{item.productName}</span>
                        <span>Rs. {baseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      
                      {finishAmount > 0 && (
                        <div className="flex justify-between text-[11px] font-medium text-emerald-600 mt-0.5">
                          <span>Finish ({item.eyeletType})</span>
                          <span>Rs. {finishAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                        <span>GST ({taxRate * 100}%)</span>
                        <span>Rs. {itemGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="mt-4 pt-2 border-t border-slate-200">
                  <div className="flex justify-between text-2xl font-black text-slate-900">
                    <span>Grand Total</span>
                    <span>Rs. {Number(quotation.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {!isAccepted && !isOrdered && (
                <button
                  onClick={handleAccept}
                  disabled={isPending}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#00bfa5] text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-[#00bfa5]/25 hover:bg-[#00a892] disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {isPending ? <Loader2 className="animate-spin" size={18} /> : null}
                  ACCEPT QUOTATION
                </button>
              )}

              {isAccepted && (
                <div className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-50 text-sm font-black uppercase tracking-widest text-emerald-600 border border-emerald-200">
                  QUOTATION ACCEPTED
                </div>
              )}

              {isOrdered && (
                <div className="flex flex-col h-14 w-full items-center justify-center gap-1 rounded-2xl bg-blue-50 text-sm font-black uppercase tracking-widest text-blue-600 border border-blue-200">
                  <span>CONVERTED TO ORDER</span>
                  {quotation.parent_order_id && <span className="text-[10px] text-blue-500 font-bold tracking-widest">ORDER #{quotation.parent_order_id}</span>}
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
