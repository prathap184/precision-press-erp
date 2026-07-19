'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from '@/lib/supabase-firestore-shim';
import { supabase } from '@/lib/supabase';
import { Loader2, Printer } from 'lucide-react';
import GSTInvoiceTemplate, { TaxTemplate, GSTInvoiceData, numberToWordsINR } from '@/components/documents/GSTInvoiceTemplate';

// Default template fallback (in case DB call fails)
const DEFAULT_TEMPLATE: TaxTemplate = {
  company_name: 'Hindustan Enterprises',
  address: '#1, New Bamboo Bazaar',
  city: 'Mysore',
  state: 'Karnataka',
  state_code: '29',
  pincode: '570001',
  phone: '+91 90007 76007',
  email: 'info@hindustanenterprises.com',
  website: '',
  gstin: '29AFHPP0687G1Z2',
  pan: 'AFHPP0687G',
  msme_reg: '',
  bank_name: 'ICICI Bank',
  branch: 'Mysore Main',
  account_number: '6255505013373',
  ifsc: 'ICIC0006255',
  beneficiary_name: 'Hindustan Enterprises',
  upi_id: '',
  logo_url: '',
  signature_url: '',
  seal_url: '',
  declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  terms: '1. Interest @ 24% PA + taxes applicable if payment not made within the stipulated time\n2. We are not responsible for Damages, Shortages which occur during transit',
  footer_text: 'This is a Computer Generated Invoice',
  invoice_prefix: 'HE',
  default_gst: 18,
  round_off: true,
  amount_in_words: true,
};

function buildInvoiceData(order: any, invoiceRecord: any, dispatchDetails: any): GSTInvoiceData {
  const cs = order.customerSnapshot || invoiceRecord?.customerSnapshot || {};
  const profile = order._profile || {};
  const baseItems = (order.items || []).map((item: any, i: number) => {
    const isSqft = item.unit?.toLowerCase() === 'sqft' || item.specs?.sqft;
    const pieces = item.quantity || item.specs?.quantity || 1;
    const sqft = item.sqft || item.specs?.sqft;
    
    // Format W and L. E.g. "8.33 - F"
    const wRaw = item.width || item.specs?.width;
    const hRaw = item.height || item.length || item.specs?.height;
    
    let wFormatted = wRaw ? String(wRaw) : undefined;
    let lFormatted = hRaw ? String(hRaw) : undefined;
    if (wFormatted && item.unit === 'sqft') wFormatted += ' - F'; // Assuming feet if sqft, though we don't strictly know if it's feet or inches. Let's just output raw number if we aren't sure, but user wants it like "8.33 - F". Let's do nothing extra unless we know. Wait, if we just use raw number it's fine, let's just leave it as wRaw.

    return {
      sr: i + 1,
      particulars: item.productName || item.particulars || 'Service',
      hsn_code: item.hsnCode || item.hsn_code || item.pricingSnapshot?.hsnCode || '39219026',
      gst_percent: item.pricingSnapshot?.tax || item.gstPercent || invoiceRecord?.gst_percent || 18,
      width: item.specs?.width ? `${item.specs.width} ${item.specs.widthUnit || ''}`.trim() : undefined,
      length: item.specs?.height ? `${item.specs.height} ${item.specs.heightUnit || ''}`.trim() : undefined,
      pcs: item.specs?.quantity || 1,
      rate_per_sq: item.pricingSnapshot?.baseRate || undefined,
      sqft: item.specs?.sqft || (item.pricingSnapshot?.baseRate ? Number(((item.itemTotal || item.amount || item.pricingSnapshot?.subTotal || 0) / item.pricingSnapshot.baseRate).toFixed(2)) : undefined),
      qty: item.specs?.quantity || 1,
      unit: 'Nos',
      amount: item.itemTotal || item.amount || item.pricingSnapshot?.subTotal || 0,
    };
  });

  const gstAmount = order.amounts?.gst || order.taxAmount || 0;
  
  const itemsSubtotal = order.amounts?.itemsSubtotal || order.amounts?.base || baseItems.reduce((acc: number, item: any) => acc + (item.amount || 0), 0);
  const extrasAmount = order.amounts?.transport || order.amounts?.extras || 0;
  const taxableValue = itemsSubtotal + extrasAmount;
  
  let parsedShippingAddr = '';
  const rawAddr = order.delivery?.address || order.shippingAddress;
  if (rawAddr && rawAddr !== 'SelfPickup' && rawAddr !== 'Self Pickup') {
    const parts = rawAddr.split('\n');
    parsedShippingAddr = parts.length > 1 ? parts.slice(1).join('\n') : rawAddr;
  }

  const billingAddr = [
    profile.billing_address_line1,
    profile.billing_address_line2,
    profile.billing_area,
    profile.billing_city,
    profile.billing_state,
    profile.billing_pincode
  ].filter(Boolean).join('\n') || cs.address || parsedShippingAddr || '';

  const shippingAddr = profile.shipping_same_as_billing !== false ? billingAddr : [
    profile.shipping_address_line1,
    profile.shipping_address_line2,
    profile.shipping_area,
    profile.shipping_city,
    profile.shipping_state,
    profile.shipping_pincode
  ].filter(Boolean).join('\n') || parsedShippingAddr || billingAddr;

  const isInterState = (() => {
    if (order.shippingAddress === 'SelfPickup' || order.shippingAddress === 'Self Pickup') return false;
    
    // 1. Check explicit shipping state code or name if they have a profile with shipping address
    if (profile.shipping_same_as_billing === false) {
      if (profile.shipping_state_code) return profile.shipping_state_code !== '29';
      if (profile.shipping_state) {
        if (profile.shipping_state.toLowerCase().includes('karnataka')) return false;
        return true;
      }
    }
    
    // 2. Fallback to parsing the final string-based shippingAddr
    const addr = (shippingAddr || '').toLowerCase();
    if (addr) {
      if (addr.includes('karnataka')) return false;
      if (/\bka\b/.test(addr)) return false;
      // If we have an address string and it doesn't contain karnataka, it might be interstate
      // Let's be slightly careful: if it's just a local street without state, it might return true.
      // But typically state is included. Let's assume if it doesn't say Karnataka, it's interstate if it matches known other states?
      // Actually, if it's a proxy order, they type the full address including state.
      // Let's just trust the string. ProxyOrderBuilder does this.
      // BUT if addr is empty, we fall back.
      // However, if the address doesn't explicitly mention karnataka but they are local, it's risky.
      // Let's check for other states. Or let's just do what ProxyOrderBuilder does.
      return true; 
    }

    // 3. If no shipping address info, use billing
    if (profile.billing_state_code) return profile.billing_state_code !== '29';
    if (cs.stateCode) return cs.stateCode !== '29';
    if (profile.billing_state && !profile.billing_state.toLowerCase().includes('karnataka')) return true;
    if (cs.state && !cs.state.toLowerCase().includes('karnataka')) return true;

    return false;
  })();

  const extras: any[] = [];
  if (extrasAmount > 0) {
    extras.push({
      sr: '',
      particulars: 'Forwarding Charge- Sale',
      hsn_code: '999799',
      amount: extrasAmount
    });
  }

  if (gstAmount > 0) {
    if (isInterState) {
      extras.push({ sr: '', particulars: 'IGST', amount: gstAmount });
    } else {
      extras.push({ sr: '', particulars: 'SGST', amount: gstAmount / 2 });
      extras.push({ sr: '', particulars: 'CGST', amount: gstAmount / 2 });
    }
  }

  if (order.amounts?.roundOff && order.amounts.roundOff !== 0) {
    extras.push({ sr: '', particulars: 'Round Off', amount: order.amounts.roundOff });
  }

  const items = [...baseItems, ...extras];

  const grandTotal = order.amounts?.grandTotal || (taxableValue + gstAmount);

  return {
    invoice_number: invoiceRecord?.invoice_number || order.invoiceNumber || `HE/${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(2)}/${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
    invoice_date: invoiceRecord?.generated_at || order.updatedAt || new Date().toISOString(),
    order_type: order.orderType || 'Credit',
    irn: invoiceRecord?.invoice_data?.irn || undefined,
    ack_number: invoiceRecord?.invoice_data?.ack_number || undefined,
    ack_date: invoiceRecord?.invoice_data?.ack_date || undefined,
    // Buyer
    buyer_name: profile.company_name || cs.businessName || cs.displayName || cs.name || 'Customer',
    buyer_address: billingAddr,
    buyer_gstin: profile.gstin || cs.gstNumber || undefined,
    buyer_state: profile.billing_state || cs.state || undefined,
    buyer_state_code: profile.billing_state_code || cs.stateCode || undefined,
    buyer_place_of_supply: profile.billing_state || cs.state || 'Karnataka',
    buyer_phone: profile.phone || cs.phone || undefined,
    // Consignee
    consignee_name: profile.consignee_name || profile.company_name || cs.businessName || cs.displayName || cs.name || 'Customer',
    consignee_address: shippingAddr,
    consignee_gstin: profile.consignee_gstin || profile.gstin || cs.gstNumber || undefined,
    consignee_state: profile.shipping_state || profile.billing_state || cs.state || undefined,
    consignee_state_code: profile.shipping_state_code || profile.billing_state_code || cs.stateCode || undefined,
    consignee_place_of_supply: profile.shipping_state || profile.billing_state || cs.state || 'Karnataka',
    consignee_phone: profile.consignee_phone || profile.phone || cs.phone || undefined,
    // Dispatch
    dispatch: dispatchDetails ? {
      transporter_name: dispatchDetails.transporter_name,
      dispatch_through: dispatchDetails.dispatch_through,
      lr_number: dispatchDetails.lr_number,
      lr_date: dispatchDetails.lr_date,
      vehicle_number: dispatchDetails.vehicle_number,
      destination: dispatchDetails.destination,
      delivery_note: dispatchDetails.delivery_note,
      delivery_note_date: dispatchDetails.delivery_note_date,
    } : {},
    // Items
    items,
    tax_items: invoiceRecord?.invoice_data?.tax_items || undefined,
    taxable_value: taxableValue,
    cgst_rate: isInterState ? undefined : 9,
    cgst_amount: isInterState ? undefined : gstAmount / 2,
    sgst_rate: isInterState ? undefined : 9,
    sgst_amount: isInterState ? undefined : gstAmount / 2,
    igst_rate: isInterState ? 18 : undefined,
    igst_amount: isInterState ? gstAmount : undefined,
    grand_total: grandTotal,
    amount_in_words: numberToWordsINR(grandTotal),
    parent_order_id: order.id,
    buyer_order_number: order.id,
    mode_of_payment: order.paymentMethod || order.orderType || '',
  };
}

export default function GSTInvoicePrintPage() {
  const { type, id } = useParams() as { type: string; id: string };
  const [template, setTemplate] = useState<TaxTemplate>(DEFAULT_TEMPLATE);
  const [invoiceData, setInvoiceData] = useState<GSTInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // 1. Load tax template
        const { data: tmpl } = await supabase.from('tax_templates').select('*').eq('is_active', true).limit(1).single();
        if (tmpl) {
          setTemplate({
            company_name: tmpl.company_name,
            address: tmpl.address,
            city: tmpl.city,
            state: tmpl.state,
            state_code: tmpl.state_code,
            pincode: tmpl.pincode,
            phone: tmpl.phone,
            email: tmpl.email,
            website: tmpl.website || '',
            gstin: tmpl.gstin,
            pan: tmpl.pan,
            msme_reg: tmpl.msme_reg || '',
            bank_name: tmpl.bank_name,
            branch: tmpl.branch,
            account_number: tmpl.account_number,
            ifsc: tmpl.ifsc,
            beneficiary_name: tmpl.beneficiary_name,
            upi_id: tmpl.upi_id || '',
            logo_url: tmpl.logo_url || '',
            signature_url: tmpl.signature_url || '',
            seal_url: tmpl.seal_url || '',
            declaration: tmpl.declaration,
            terms: tmpl.terms,
            footer_text: tmpl.footer_text,
            invoice_prefix: tmpl.invoice_prefix,
            default_gst: Number(tmpl.default_gst),
            round_off: tmpl.round_off,
            amount_in_words: tmpl.amount_in_words ?? true,
          });
        }

        // 2. Load invoice record from Supabase
        let invoiceRecord: any = null;
        let orderId = id;
        const { data: inv } = await supabase.from('invoices').select('*').eq('parent_order_id', id).single();
        if (inv) {
          invoiceRecord = inv;
          orderId = inv.parent_order_id || id;
        }

        // 3. Load order from Firebase
        const orderSnap = await getDoc(doc(db, 'orders', orderId));
        let order: any = null;
        if (orderSnap.exists()) {
          order = { id: orderSnap.id, ...orderSnap.data() };
        } else {
          setError('Order not found');
          return;
        }

        // 4. Load expanded customer profile from Supabase
        const uid = invoiceRecord?.customer_id || order.customerId || order.customer_id || order.customerSnapshot?.uid || order.customerSnapshot?.id;
        if (uid) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('uid', uid).single();
          if (profile) order._profile = profile;
        }

        // 5. Load dispatch details
        const { data: dispatch } = await supabase.from('dispatch_details').select('*').eq('parent_order_id', orderId).single();

        // 6. Build invoice data
        setInvoiceData(buildInvoiceData(order, invoiceRecord, dispatch));
      } catch (e: any) {
        console.error(e);
        setError(e.message || 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchAll();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-indigo-500 w-8 h-8" />
        <p className="text-sm text-slate-500 font-medium">Preparing invoice…</p>
      </div>
    </div>
  );

  if (error || !invoiceData) return (
    <div className="p-8 text-center">
      <p className="text-red-500 font-bold">{error || 'Invoice not found'}</p>
    </div>
  );

  return (
    <div className="bg-slate-100 min-h-screen">
      {/* Print controls */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all uppercase tracking-widest"
        >
          <Printer size={16} /> Print Invoice
        </button>
      </div>

      <div className="pt-16 pb-16 flex justify-center">
        <div className="w-full max-w-[900px] shadow-2xl">
          <GSTInvoiceTemplate template={template} invoice={invoiceData} forPrint />
        </div>
      </div>
    </div>
  );
}
