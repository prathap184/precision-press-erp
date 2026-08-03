'use client';
export const dynamic = 'force-dynamic';

import React, { useCallback, useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  ArrowLeft, ChevronRight, FilePlus2, Loader2, CheckCircle,
  ArrowRight, AlertCircle, Receipt, Eye, RefreshCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import GSTInvoiceTemplate, { TaxTemplate, GSTInvoiceData } from '@/components/documents/GSTInvoiceTemplate';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChildOrder {
  id: string;
  productName: string | null;
  status: string;
  amounts: any;
  // Immutable snapshot fields
  gst_type: string | null;
  cgst_percentage: number | null;
  cgst_amount: number | null;
  sgst_percentage: number | null;
  sgst_amount: number | null;
  igst_percentage: number | null;
  igst_amount: number | null;
  allocated_logistics_amount: number | null;
  taxable_value_snapshot: number | null;
  grand_total_snapshot: number | null;
  item_amount: number | null;
  // Invoice state
  invoice_generated: boolean;
  invoice_status: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_generated_at: string | null;
  customerSnapshot?: any;
  shippingAddress?: string;
  specs?: any;
  pricingSnapshot?: any;
  hsnCode?: string;
  hsn_code?: string;
  items?: any;
  dispatchDetails?: any;
  delivery?: any;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  PENDING:     { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400',  label: 'Pending'      },
  GENERATED:   { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Generated'    },
  PRINTED:     { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500',   label: 'Printed'      },
  HANDED_OVER: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500', label: 'Handed Over'  },
  CANCELLED:   { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-400',    label: 'Cancelled'    },
};

function StatusBadge({ status }: { status: string | null }) {
  const s = STATUS_BADGE[status || 'PENDING'] ?? STATUS_BADGE['PENDING'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── Value helpers ─────────────────────────────────────────────────────────────

function val(x: number | null | undefined): number {
  return x ?? 0;
}

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getSnapshotTaxable(c: ChildOrder): number {
  return val(c.taxable_value_snapshot) || val(c.amounts?.subtotal) || val(c.amounts?.productTotal);
}
function getSnapshotGrand(c: ChildOrder): number {
  return val(c.grand_total_snapshot) || val(c.amounts?.grandTotal);
}
function getSnapshotCgst(c: ChildOrder): number {
  return val(c.cgst_amount) || val(c.amounts?.cgst);
}
function getSnapshotSgst(c: ChildOrder): number {
  return val(c.sgst_amount) || val(c.amounts?.sgst);
}
function getSnapshotIgst(c: ChildOrder): number {
  return val(c.igst_amount) || val(c.amounts?.igst);
}
function getSnapshotLogistics(c: ChildOrder): number {
  return val(c.allocated_logistics_amount);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InvoiceGenerationSelectPage({
  params,
}: {
  params: { customerId: string; parentOrderId: string };
}) {
  const { customerId, parentOrderId } = params;
  const router = useRouter();
  const { user, profile } = useAuth();

  const [childOrders, setChildOrders] = useState<ChildOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [customerProfile, setCustomerProfile] = useState<any>(null);
  const [companyTemplate, setCompanyTemplate] = useState<TaxTemplate | null>(null);
  const [parentDelivery, setParentDelivery] = useState<any>(null);
  const [parentOrderDate, setParentOrderDate] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genSuccess, setGenSuccess] = useState<{ invoiceId: string; invoiceNumber: string } | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showPreview, setShowPreview] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load child orders — try parent_order_id column first, fallback to LIKE pattern
      let { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('parent_order_id', parentOrderId)
        .order('id', { ascending: true });

      if (error || !data || data.length === 0) {
        // Fallback: LIKE pattern for older orders
        const res = await supabase
          .from('orders')
          .select('*')
          .like('id', `${parentOrderId}-item%`)
          .order('id', { ascending: true });
        data = res.data;
        error = res.error;
      }

      if (error) throw error;
      
      let loadedChildOrders = (data || []) as ChildOrder[];

      if (loadedChildOrders.length === 0) {
        const { data: parentData } = await supabase
          .from('orders')
          .select('*')
          .eq('id', parentOrderId)
          .single();
        if (parentData) {
          loadedChildOrders = [parentData as ChildOrder];
        }
      }

      // Extract specs from child.items directly to show W/L
      const { data: dispatchDetailsList } = await supabase
        .from('dispatch_details')
        .select('*')
        .in('parent_order_id', loadedChildOrders.length > 0 ? loadedChildOrders.map(c => c.id) : ['_dummy_']);
      
      const dispatchMap = new Map();
      if (dispatchDetailsList) {
        dispatchDetailsList.forEach(d => dispatchMap.set(d.parent_order_id, d));
      }

      loadedChildOrders = loadedChildOrders.map(child => {
        let fbItem: any = null;
        try {
          const itemsArr = typeof child.items === 'string' ? JSON.parse(child.items) : (Array.isArray(child.items) ? child.items : []);
          if (itemsArr && itemsArr.length > 0) fbItem = itemsArr[0];
        } catch(e) {}
        
        return {
          ...child,
          specs: child.specs || fbItem?.specs || { 
            width: fbItem?.width, 
            height: fbItem?.height, 
            widthUnit: fbItem?.widthUnit, 
            heightUnit: fbItem?.heightUnit, 
            quantity: fbItem?.quantity, 
            sqft: fbItem?.sqft 
          },
          pricingSnapshot: child.pricingSnapshot || fbItem?.pricingSnapshot,
          hsnCode: child.hsnCode || child.hsn_code || fbItem?.hsnCode || fbItem?.pricingSnapshot?.hsnCode,
          dispatchDetails: dispatchMap.get(child.id) || child.dispatchDetails
        };
      });

      // Fetch parent order from Firebase as fallback
      if (parentOrderId) {
        try {
          const parentSnap = await getDoc(doc(db, 'orders', parentOrderId));
          if (parentSnap.exists()) {
            const parentData = parentSnap.data();
            if (parentData.items && Array.isArray(parentData.items)) {
              loadedChildOrders = loadedChildOrders.map(child => {
                let fbItem = parentData.items.find((i: any) => i.id === child.id || `${parentOrderId}-${i.id}` === child.id || `${parentOrderId}-item-${parentData.items.indexOf(i) + 1}` === child.id);
                if (!fbItem && parentData.items.length === loadedChildOrders.length) {
                  const idx = loadedChildOrders.findIndex(co => co.id === child.id);
                  if (idx >= 0) fbItem = parentData.items[idx];
                }
                
                if (fbItem && (!child.specs?.width || !child.pricingSnapshot)) {
                  return {
                    ...child,
                    specs: fbItem.specs || child.specs,
                    pricingSnapshot: fbItem.pricingSnapshot || child.pricingSnapshot,
                    hsnCode: fbItem.hsnCode || fbItem.pricingSnapshot?.hsnCode || child.hsnCode,
                  };
                }
                return child;
              });
            }
          }
        } catch (e) {
          console.error("Error fetching firebase parent order:", e);
        }
      }

      setChildOrders(loadedChildOrders);

      // Load customer profile
      const { data: prof } = await supabase
        .from('profiles')
        .select('first_name, last_name, company_name, address, gstin, phone, billing_address_line1, billing_address_line2, billing_area, billing_city, billing_state, billing_state_code, billing_pincode, shipping_address_line1, shipping_address_line2, shipping_area, shipping_city, shipping_state, shipping_state_code, shipping_pincode, shipping_same_as_billing, consignee_name, consignee_gstin, consignee_phone')
        .eq('uid', customerId)
        .single();
      if (prof) {
        const n = `${prof.first_name || ''} ${prof.last_name || ''}`.trim();
        setCustomerName(n || prof.company_name || '');
        setCustomerProfile(prof);
      }

      // Load parent order to get delivery info and date
      let parentDelivery = null;
      if (parentOrderId) {
        const { data: pData } = await supabase
          .from('orders')
          .select('delivery, shippingAddress, createdAt')
          .eq('id', parentOrderId)
          .single();
        if (pData) {
          setParentDelivery({
            address: pData.delivery?.address || pData.shippingAddress
          });
          if (pData.createdAt) {
            let parsedDate = pData.createdAt;
            if (typeof parsedDate === 'string' && parsedDate.startsWith('"')) {
               parsedDate = parsedDate.replace(/"/g, '');
            }
            setParentOrderDate(parsedDate);
          }
        }
        


      // Load active company template
      const { data: tpl } = await supabase
        .from('tax_templates')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single();
      if (tpl) {
        setCompanyTemplate({
          company_name: tpl.company_name,
          address: tpl.address,
          city: tpl.city,
          state: tpl.state,
          state_code: tpl.state_code,
          pincode: tpl.pincode,
          phone: tpl.phone,
          email: tpl.email,
          website: tpl.website || '',
          gstin: tpl.gstin,
          pan: tpl.pan,
          msme_reg: tpl.msme_reg || '',
          bank_name: tpl.bank_name,
          branch: tpl.branch,
          account_number: tpl.account_number,
          ifsc: tpl.ifsc,
          beneficiary_name: tpl.beneficiary_name,
          upi_id: tpl.upi_id || '',
          logo_url: tpl.logo_url || '',
          signature_url: tpl.signature_url || '',
          seal_url: tpl.seal_url || '',
          declaration: tpl.declaration,
          terms: tpl.terms,
          footer_text: tpl.footer_text,
          invoice_prefix: tpl.invoice_prefix,
          default_gst: tpl.default_gst,
          round_off: tpl.round_off,
          amount_in_words: tpl.amount_in_words ?? true,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [parentOrderId, customerId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Toggle selection — only allowed for pending items
  const toggleSelect = (orderId: string, isPending: boolean) => {
    if (!isPending) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const selectAllPending = () => {
    const pendingIds = childOrders
      .filter(c => !c.invoice_generated && (c.invoice_status === 'PENDING' || !c.invoice_status))
      .map(c => c.id);
    setSelected(new Set(pendingIds));
  };

  const clearSelection = () => setSelected(new Set());

  // Compute summary totals from stored values — no recalculation
  const selectedOrders = childOrders.filter(c => selected.has(c.id));
  const summary = selectedOrders.reduce(
    (acc, c) => ({
      taxable:   acc.taxable   + getSnapshotTaxable(c),
      cgst:      acc.cgst      + getSnapshotCgst(c),
      sgst:      acc.sgst      + getSnapshotSgst(c),
      igst:      acc.igst      + getSnapshotIgst(c),
      logistics: acc.logistics + getSnapshotLogistics(c),
      grand:     acc.grand     + getSnapshotGrand(c),
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, logistics: 0, grand: 0 }
  );

  const pendingCount = childOrders.filter(c => !c.invoice_generated).length;
  const invoicedCount = childOrders.filter(c => c.invoice_generated).length;
  const hasInterstate = selectedOrders.some(c => c.gst_type === 'IGST');
  const hasMixed = selectedOrders.some(c => c.gst_type === 'CGST_SGST') && selectedOrders.some(c => c.gst_type === 'IGST');
  const hasUndispatched = selectedOrders.some(c => c.status !== 'DISPATCHED' && c.status !== 'DELIVERED');

  // Generate invoice
  const handleGenerate = async () => {
    if (selected.size === 0) {
      setGenError('Please select at least one item.');
      return;
    }
    if (hasMixed) {
      setGenError('Cannot mix interstate (IGST) and intrastate (CGST+SGST) items in a single invoice.');
      return;
    }
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childOrderIds:  Array.from(selected),
          parentOrderId,
          customerId,
          invoiceDate,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Invoice generation failed');
      setGenSuccess({ invoiceId: data.invoiceId, invoiceNumber: data.invoiceNumber });
      await loadData();
      setSelected(new Set());
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']}>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/admin/invoice-generation/${customerId}`)}
            className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <FilePlus2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.4em]">Invoice Generation</p>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight font-mono">{parentOrderId}</h1>
              {customerName && <p className="text-xs text-slate-400 font-medium mt-0.5">{customerName}</p>}
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 flex-wrap">
          <Link href="/admin/invoice-generation" className="text-violet-600 hover:underline">Customers</Link>
          <ChevronRight size={12} />
          <Link href={`/admin/invoice-generation/${customerId}`} className="text-violet-600 hover:underline">{customerName}</Link>
          <ChevronRight size={12} />
          <span className="text-violet-600 font-mono">{parentOrderId}</span>
        </div>

        {/* Success Banner */}
        {genSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-black text-green-800">Invoice Generated Successfully!</p>
                <p className="text-xs text-green-600 font-mono font-bold mt-0.5">{genSuccess.invoiceNumber}</p>
                <p className="text-xs text-green-600 font-medium mt-1">
                  Select more items above to generate another invoice for this order.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/admin/invoices/${genSuccess.invoiceId}`}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-black rounded-xl transition-colors"
              >
                <Eye size={13} />
                View Invoice
              </Link>
              <button
                onClick={() => setGenSuccess(null)}
                className="p-2 text-green-500 hover:text-green-700 transition-colors"
              >
                <RefreshCcw size={14} />
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        ) : childOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
              <Receipt className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-bold text-sm text-center">No child orders found for this parent order.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/* ── LEFT: Child Orders Table ── */}
            <div className="lg:col-span-2 space-y-4">

              {/* Selection controls */}
              <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3">
                <div className="flex items-center gap-4">
                  <div className="text-xs font-bold text-slate-500">
                    <span className="text-amber-600">{pendingCount}</span> Pending ·{' '}
                    <span className="text-green-600">{invoicedCount}</span> Invoiced
                  </div>
                  {selected.size > 0 && (
                    <span className="text-xs font-black text-violet-600">{selected.size} selected</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {pendingCount > 0 && (
                    <button
                      onClick={selectAllPending}
                      className="text-xs font-bold text-violet-600 hover:text-violet-800 px-3 py-1.5 rounded-lg hover:bg-violet-50 transition-colors"
                    >
                      Select All Pending
                    </button>
                  )}
                  {selected.size > 0 && (
                    <button
                      onClick={clearSelection}
                      className="text-xs font-bold text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="w-10 px-4 py-3" />
                        <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item</th>
                        <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxable</th>
                        <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">GST</th>
                        <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Logistics</th>
                        <th className="text-right px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                        <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice</th>
                        <th className="w-10 px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {childOrders.map((child, idx) => {
                        const isPending = !child.invoice_generated;
                        const isChecked = selected.has(child.id);
                        const gstTotal  = getSnapshotCgst(child) + getSnapshotSgst(child) + getSnapshotIgst(child);
                        const gstLabel  = child.gst_type === 'IGST'
                          ? `IGST ${val(child.igst_percentage)}%`
                          : child.cgst_percentage
                            ? `CGST ${val(child.cgst_percentage)}% + SGST ${val(child.sgst_percentage)}%`
                            : null;

                        return (
                          <tr
                            key={child.id}
                            onClick={() => toggleSelect(child.id, isPending)}
                            className={`border-b border-slate-100 transition-colors ${
                              !isPending ? 'opacity-60 cursor-not-allowed bg-slate-50' :
                              isChecked  ? 'bg-violet-50 cursor-pointer hover:bg-violet-100' :
                                           'cursor-pointer hover:bg-slate-50'
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="px-4 py-4">
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                !isPending ? 'border-slate-200 bg-slate-100' :
                                isChecked  ? 'border-violet-500 bg-violet-500' :
                                             'border-slate-300 bg-white'
                              }`}>
                                {isChecked && isPending && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                                {!isPending && (
                                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                )}
                              </div>
                            </td>

                            {/* Item */}
                            <td className="px-4 py-4">
                              <p className="text-xs font-black text-slate-700 font-mono">{child.id.split('-').slice(-1)[0]}</p>
                              <p className="text-xs text-slate-500 font-medium mt-0.5 max-w-[160px] truncate">
                                {child.productName || 'Item'}
                              </p>
                              {gstLabel && (
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{gstLabel}</p>
                              )}
                            </td>

                            {/* Taxable */}
                            <td className="px-4 py-4 text-right">
                              <p className="text-xs font-bold text-slate-700">{fmt(getSnapshotTaxable(child))}</p>
                            </td>

                            {/* GST */}
                            <td className="px-4 py-4 text-right">
                              <p className="text-xs font-bold text-slate-700">{fmt(gstTotal)}</p>
                              {child.gst_type === 'CGST_SGST' && gstTotal > 0 && (
                                <p className="text-[10px] text-slate-400">
                                  {fmt(getSnapshotCgst(child))} + {fmt(getSnapshotSgst(child))}
                                </p>
                              )}
                            </td>

                            {/* Logistics */}
                            <td className="px-4 py-4 text-right">
                              <p className="text-xs font-bold text-slate-600">{fmt(getSnapshotLogistics(child))}</p>
                            </td>

                            {/* Grand Total */}
                            <td className="px-4 py-4 text-right">
                              <p className="text-xs font-black text-slate-900">{fmt(getSnapshotGrand(child))}</p>
                            </td>

                            {/* Invoice Status */}
                            <td className="px-4 py-4 text-center">
                              <StatusBadge status={child.invoice_generated ? (child.invoice_status || 'GENERATED') : 'PENDING'} />
                            </td>

                            {/* Invoice Number */}
                            <td className="px-4 py-4 text-center">
                              {child.invoice_number ? (
                                <span className="text-[10px] font-black text-slate-700 font-mono">{child.invoice_number}</span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-medium">—</span>
                              )}
                            </td>

                            {/* Action Arrow */}
                            <td className="px-4 py-4 text-center">
                              {child.invoice_id ? (
                                <Link
                                  href={`/admin/invoices/${child.invoice_id}/print`}
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
                                  title="View invoice"
                                >
                                  <ArrowRight size={13} />
                                </Link>
                              ) : (
                                <span className="text-slate-200">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Summary & Generate ── */}
            <div className="space-y-4">

              {/* Invoice Summary */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center">
                    <Receipt size={14} className="text-violet-600" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Invoice Summary</h3>
                </div>

                <div className="space-y-4 text-sm mt-4">
                  {selectedOrders.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No items selected.</p>
                  )}
                  {selectedOrders.map((child) => {
                    const itemAmount = val(child.item_amount) || val(child.amounts?.productTotal) || val(child.amounts?.subtotal);
                    const finishAmount = val(child.amounts?.finishCharges) || val(child.amounts?.finish);
                    const cgst = getSnapshotCgst(child);
                    const sgst = getSnapshotSgst(child);
                    const igst = getSnapshotIgst(child);
                    const logistics = getSnapshotLogistics(child);
                    const grand = getSnapshotGrand(child);
                    const itemTotal = grand - logistics;

                    return (
                      <div key={child.id} className="border-b border-slate-100 pb-4">
                        <div className="flex justify-between font-bold text-slate-900 mb-1.5">
                          <span>{child.productName || 'Item'}</span>
                          <span>{fmt(itemAmount)}</span>
                        </div>
                        {cgst > 0 && (
                          <div className="flex justify-between text-xs text-slate-400 font-medium mb-1">
                            <span>CGST {child.cgst_percentage ? `(${val(child.cgst_percentage)}%)` : ''}</span>
                            <span>{fmt(cgst)}</span>
                          </div>
                        )}
                        {sgst > 0 && (
                          <div className="flex justify-between text-xs text-slate-400 font-medium mb-1">
                            <span>SGST {child.sgst_percentage ? `(${val(child.sgst_percentage)}%)` : ''}</span>
                            <span>{fmt(sgst)}</span>
                          </div>
                        )}
                        {igst > 0 && (
                          <div className="flex justify-between text-xs text-slate-400 font-medium mb-1">
                            <span>IGST {child.igst_percentage ? `(${val(child.igst_percentage)}%)` : ''}</span>
                            <span>{fmt(igst)}</span>
                          </div>
                        )}
                        {finishAmount > 0 && (
                          <div className="flex justify-between text-xs text-emerald-600 font-black mb-1.5 mt-1.5">
                            <span>Finish</span>
                            <span>{fmt(finishAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-slate-800 mt-2 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                          <span>Item Total</span>
                          <span>{fmt(itemTotal)}</span>
                        </div>
                      </div>
                    );
                  })}

                  {summary.logistics > 0 && (
                    <div className="flex justify-between font-bold text-slate-700 py-2">
                      <span>Logistics</span>
                      <span>{fmt(summary.logistics)}</span>
                    </div>
                  )}

                  {selectedOrders.length > 0 && (
                    <div className="flex justify-between items-center py-4 mt-2 border-t-2 border-slate-900">
                      <span className="font-black text-slate-900 text-lg tracking-tight">Grand Total</span>
                      <span className="font-black text-slate-900 text-xl">{fmt(summary.grand)}</span>
                    </div>
                  )}
                </div>

                {hasMixed && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 font-medium">
                      Cannot mix interstate (IGST) and intrastate (CGST+SGST) items in one invoice.
                    </p>
                  </div>
                )}

                {hasUndispatched && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 font-medium">
                      Cannot generate invoice. Some selected items have not been dispatched yet (dispatch details missing).
                    </p>
                  </div>
                )}
              </div>

              {/* Invoice Date */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all bg-slate-50"
                />
              </div>

              {/* Error */}
              {genError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-medium">{genError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={selected.size === 0}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye size={18} />
                  Preview Invoice
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating || selected.size === 0 || hasMixed || hasUndispatched}
                  className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {generating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <FilePlus2 size={18} />
                      Generate Invoice
                      {selected.size > 0 && <span className="ml-1 text-violet-200">({selected.size} items)</span>}
                    </>
                  )}
                </button>
              </div>

              {selected.size === 0 && !generating && (
                <p className="text-center text-xs text-slate-400 font-medium">
                  Select at least one pending item above
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Preview Modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-full overflow-y-auto shadow-2xl relative flex flex-col">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
              <h2 className="text-lg font-black text-slate-900 uppercase">Invoice Preview</h2>
              <button onClick={() => setShowPreview(false)} className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                ✕
              </button>
            </div>
            <div className="p-4 sm:p-8 font-sans bg-slate-50 flex justify-center">
              <div className="w-full shadow-lg rounded-sm overflow-hidden" style={{ maxWidth: '900px' }}>
                {companyTemplate ? (() => {
                  const cs = selectedOrders[0]?.customerSnapshot || {};
                  
                  let parsedShippingAddr = '';
                  let rawAddr = parentDelivery?.address || selectedOrders[0]?.delivery?.address || selectedOrders[0]?.shippingAddress;
                  if (rawAddr && rawAddr !== 'SelfPickup' && rawAddr !== 'Self Pickup') {
                    const parts = rawAddr.split('\n');
                    parsedShippingAddr = parts.length > 1 ? parts.slice(1).join('\n') : rawAddr;
                  }

                  const billingAddr = [
                    customerProfile?.billing_address_line1,
                    customerProfile?.billing_address_line2,
                    customerProfile?.billing_area,
                    customerProfile?.billing_city,
                    customerProfile?.billing_state,
                    customerProfile?.billing_pincode
                  ].filter(Boolean).join('\n') || cs.address || parsedShippingAddr || customerProfile?.address || 'Address not found';

                  const shippingAddr = customerProfile?.shipping_same_as_billing !== false ? billingAddr : [
                    customerProfile?.shipping_address_line1,
                    customerProfile?.shipping_address_line2,
                    customerProfile?.shipping_area,
                    customerProfile?.shipping_city,
                    customerProfile?.shipping_state,
                    customerProfile?.shipping_pincode
                  ].filter(Boolean).join('\n') || parsedShippingAddr || billingAddr;

                  return (
                  <GSTInvoiceTemplate
                    template={companyTemplate}
                    invoice={{
                      invoice_number: 'DRAFT',
                      invoice_date: invoiceDate,
                      order_type: 'Credit',
                      buyer_order_no: parentOrderId,
                      buyer_order_date: parentOrderDate ? new Date(parentOrderDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '',
                      mode_of_payment: paymentMode,
                      buyer_name: customerProfile?.company_name || cs.businessName || cs.displayName || cs.name || customerName || 'Customer',
                      buyer_address: billingAddr,
                      buyer_phone: customerProfile?.phone || cs.phone || '',
                      buyer_place_of_supply: customerProfile?.billing_state || cs.state || 'Karnataka',
                      buyer_gstin: customerProfile?.gstin || cs.gstNumber || '',
                      consignee_name: customerProfile?.consignee_name || customerProfile?.company_name || cs.businessName || cs.displayName || cs.name || customerName || 'Customer',
                      consignee_address: shippingAddr,
                      consignee_phone: customerProfile?.consignee_phone || customerProfile?.phone || cs.phone || '',
                      consignee_place_of_supply: customerProfile?.shipping_state || customerProfile?.billing_state || cs.state || 'Karnataka',
                      consignee_gstin: customerProfile?.consignee_gstin || customerProfile?.gstin || cs.gstNumber || '',
                      dispatch: selectedOrders[0]?.dispatchDetails ? {
                        transporter_name: selectedOrders[0].dispatchDetails.transporter_name,
                        dispatch_through: selectedOrders[0].dispatchDetails.dispatch_through,
                        lr_number: selectedOrders[0].dispatchDetails.lr_number,
                        lr_date: selectedOrders[0].dispatchDetails.lr_date ? new Date(selectedOrders[0].dispatchDetails.lr_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '',
                        vehicle_number: selectedOrders[0].dispatchDetails.vehicle_number,
                        destination: selectedOrders[0].dispatchDetails.destination,
                        delivery_note: selectedOrders[0].dispatchDetails.delivery_note,
                        delivery_note_date: selectedOrders[0].dispatchDetails.delivery_note_date ? new Date(selectedOrders[0].dispatchDetails.delivery_note_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '',
                      } : undefined,
                      items: selectedOrders.flatMap((c, i) => {
                        const itemAmount = val(c.item_amount) || val(c.amounts?.productTotal) || val(c.amounts?.subtotal);
                        const finishAmount = val(c.amounts?.finishCharges) || val(c.amounts?.finish);
                        const cgst = getSnapshotCgst(c);
                        const sgst = getSnapshotSgst(c);
                        const igst = getSnapshotIgst(c);
                        const logistics = getSnapshotLogistics(c);
                        const grand = getSnapshotGrand(c);
                        const isInterState = c.gst_type === 'IGST';

                        const rows: any[] = [];
                        
                        rows.push({
                          sr: i + 1,
                          particulars: c.productName || 'Item ' + c.id.split('-').pop(),
                          hsn_code: c.hsnCode || c.hsn_code || c.pricingSnapshot?.hsnCode || '39219026',
                          gst_percent: c.pricingSnapshot?.tax || (isInterState ? val(c.igst_percentage) : (val(c.cgst_percentage) + val(c.sgst_percentage))),
                          width: c.specs?.width ? `${c.specs.width} ${c.specs.widthUnit || ''}`.trim() : undefined,
                          length: c.specs?.height ? `${c.specs.height} ${c.specs.heightUnit || ''}`.trim() : undefined,
                          pcs: c.specs?.quantity || 1,
                          rate_per_sq: c.pricingSnapshot?.baseRate || undefined,
                          sqft: c.specs?.sqft || (c.pricingSnapshot?.baseRate ? Number((itemAmount / c.pricingSnapshot.baseRate).toFixed(2)) : undefined),
                          qty: c.specs?.quantity || 1,
                          unit: 'Nos',
                          amount: itemAmount,
                        });

                        if (finishAmount > 0) {
                          rows.push({ particulars: '    └─ Finish Charges', amount: finishAmount, gst_percent: '' });
                        }
                        if (isInterState && igst > 0) {
                          rows.push({ particulars: `    └─ IGST (${val(c.igst_percentage)}%)`, amount: igst, gst_percent: '' });
                        } else {
                          if (cgst > 0) rows.push({ particulars: `    └─ CGST (${val(c.cgst_percentage)}%)`, amount: cgst, gst_percent: '' });
                          if (sgst > 0) rows.push({ particulars: `    └─ SGST (${val(c.sgst_percentage)}%)`, amount: sgst, gst_percent: '' });
                        }

                        rows.push({ particulars: '    └─ Item Total', amount: (grand - logistics), gst_percent: '' });
                        
                        if (logistics > 0) {
                          rows.push({ particulars: '    └─ Logistics', amount: logistics, gst_percent: '' });
                        }
                        
                        return rows;
                      }),
                      tax_items: selectedOrders.map(c => ({
                        particulars: c.productName || 'Item ' + c.id.split('-').pop(),
                        taxable_value: getSnapshotTaxable(c),
                        cgst_amount: getSnapshotCgst(c),
                        sgst_amount: getSnapshotSgst(c),
                        igst_amount: getSnapshotIgst(c),
                        cgst_rate: val(c.cgst_percentage),
                        sgst_rate: val(c.sgst_percentage),
                        igst_rate: val(c.igst_percentage),
                      })),
                      taxable_value: selectedOrders.reduce((sum, c) => sum + getSnapshotTaxable(c), 0),
                      cgst_amount: selectedOrders.reduce((sum, c) => sum + getSnapshotCgst(c), 0),
                      sgst_amount: selectedOrders.reduce((sum, c) => sum + getSnapshotSgst(c), 0),
                      igst_amount: selectedOrders.reduce((sum, c) => sum + getSnapshotIgst(c), 0),
                      grand_total: selectedOrders.reduce((sum, c) => sum + getSnapshotGrand(c), 0),
                      parent_order_id: parentOrderId,
                    }}
                  />
                  );
                })() : (
                  <div className="p-12 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-3 text-slate-400" />
                    <p>No active invoice template found. Please configure GST & Invoice settings.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
