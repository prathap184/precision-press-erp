'use client';
export const dynamic = 'force-dynamic';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import GSTInvoiceTemplate, { GSTInvoiceData, TaxTemplate, InvoiceItem } from '@/components/documents/GSTInvoiceTemplate';

export default function AdminInvoicePrintPage() {
  const { id } = useParams() as { id: string };
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatchDetails, setDispatchDetails] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setLoading(false);
        } else {
          setInvoice(data);
          
          // The backend now saves a permanent snapshot of dispatch details directly inside the customer_snapshot
          if (data?.customer_snapshot?.dispatch) {
            setDispatchDetails(data.customer_snapshot.dispatch);
          }
          
          setLoading(false);
        }
      });
  }, [id]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  if (!invoice) return <div className="p-8 text-center">Invoice not found</div>;

  if (invoice.status !== 'GENERATED') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Invoice Generating</h2>
        <p className="text-slate-500 mt-2">The final tax invoice is currently being generated. Please wait...</p>
        <button onClick={() => window.location.reload()} className="mt-6 px-4 py-2 bg-slate-900 text-white rounded shadow text-sm">Refresh Status</button>
      </div>
    );
  }

  const c_snap = invoice.customer_snapshot || {};
  const t_snap = invoice.company_snapshot || {};
  const d_snap = invoice.dispatch_details_snapshot || {};

  // Build the TaxTemplate object
  const template: TaxTemplate = {
    company_name: t_snap.company_name || 'Hindustan Enterprises',
    address: t_snap.address || '#1, New Bamboo Bazaar\nMysore - 570001',
    city: t_snap.city || 'Mysore',
    state: t_snap.state || 'Karnataka',
    state_code: t_snap.state_code || '29',
    pincode: t_snap.pincode || '570001',
    phone: t_snap.phone || '+91 90007 76007',
    email: t_snap.email || 'info@hindustanenterprises.com',
    gstin: t_snap.gstin || '29AFHPP0687G1Z2',
    pan: t_snap.pan || 'AFHPP0687G',
    bank_name: t_snap.bank_name || 'ICICI Bank',
    branch: t_snap.branch || 'Mysore Main',
    account_number: t_snap.account_number || '6255505013373',
    ifsc: t_snap.ifsc || 'ICIC0006255',
    beneficiary_name: t_snap.beneficiary_name || 'Hindustan Enterprises',
    declaration: t_snap.declaration || 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.\n1. Interest @ 24% P.A + taxes applicable if payment not made within the stipulated time\n2. We are not responsible for Damages, Shortages which occur during transit',
    terms: t_snap.terms || '',
    footer_text: t_snap.footer_text || 'For Hindustan Enterprises',
    invoice_prefix: t_snap.invoice_prefix || 'HE/2026-27/',
    default_gst: t_snap.default_gst || 18,
    round_off: t_snap.round_off ?? true,
    amount_in_words: t_snap.amount_in_words ?? true,
  };

  const dbItems = invoice.items || [];
  const mappedItems: InvoiceItem[] = dbItems.map((it: any) => ({
    sr: it.sr,
    particulars: it.particulars,
    hsn_code: it.hsn_code || it.hsnCode,
    gst_percent: it.gst_percent,
    width: it.width,
    length: it.length,
    pcs: it.pcs,
    rate_per_sq: it.rate_per_sq || it.rate,
    qty: it.qty,
    unit: it.unit,
    sqft: it.sqft,
    amount: it.amount || it.taxableValue || it.itemTotal
  }));

  // Build the GSTInvoiceData object
  const invData: GSTInvoiceData = {
    invoice_number: invoice.invoice_number,
    invoice_date: new Date(invoice.invoice_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }),
    order_type: 'Credit', // Could be dynamic based on order
    buyer_name: c_snap.name || c_snap.companyName || 'Unknown',
    buyer_address: c_snap.address || c_snap.billing_address?.address_line || 'N/A',
    buyer_phone: c_snap.phone,
    buyer_gstin: c_snap.gstin || 'Unregistered',
    buyer_state: c_snap.state || 'Karnataka',
    consignee_name: c_snap.name || c_snap.companyName || 'Unknown',
    consignee_address: c_snap.address || c_snap.billing_address?.address_line || 'N/A',
    consignee_phone: c_snap.phone,
    consignee_gstin: c_snap.gstin || 'Unregistered',
    consignee_state: c_snap.state || 'Karnataka',
    
    buyer_order_no: invoice.parent_order_id,
    buyer_order_date: c_snap.parent_order_created_at ? new Date(c_snap.parent_order_created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : new Date(invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }),
    mode_of_payment: c_snap.payment_mode || '',
    
    dispatch: dispatchDetails ? {
      transporter_name: dispatchDetails.transporter_name,
      dispatch_through: dispatchDetails.dispatch_through,
      lr_number: dispatchDetails.lr_number,
      lr_date: dispatchDetails.lr_date ? new Date(dispatchDetails.lr_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '',
      vehicle_number: dispatchDetails.vehicle_number,
      destination: dispatchDetails.destination,
      delivery_note: dispatchDetails.delivery_note,
      delivery_note_date: dispatchDetails.delivery_note_date ? new Date(dispatchDetails.delivery_note_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '',
    } : d_snap,
    
    items: mappedItems,
    
    taxable_value: invoice.taxable_value || 0,
    cgst_amount: invoice.is_inter_state ? 0 : (invoice.cgst_amount || 0),
    sgst_amount: invoice.is_inter_state ? 0 : (invoice.sgst_amount || 0),
    igst_amount: invoice.is_inter_state ? (invoice.igst_amount || 0) : 0,
    round_off: invoice.round_off || 0,
    grand_total: invoice.grand_total || 0,
    amount_in_words: invoice.amount_in_words || ''
  };

  return (
    <div className="bg-slate-100 min-h-screen py-8">
      <div className="max-w-[210mm] mx-auto mb-4 flex justify-end no-print">
        <button onClick={() => window.print()} className="px-6 py-2 bg-blue-600 text-white font-bold rounded shadow hover:bg-blue-700">
          Print / Save as PDF
        </button>
      </div>
      <GSTInvoiceTemplate invoice={invData} template={template} />
    </div>
  );
}
