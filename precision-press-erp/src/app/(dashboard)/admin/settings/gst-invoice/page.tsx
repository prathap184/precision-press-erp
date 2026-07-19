'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { RoleGuard } from '@/lib/role-guard';
import {
  Building2, CreditCard, FileText, Settings2,
  MessageSquare, Eye, Save, Upload, Loader2, CheckCircle, AlertCircle
} from 'lucide-react';
import GSTInvoiceTemplate, { TaxTemplate, GSTInvoiceData } from '@/components/documents/GSTInvoiceTemplate';

const TABS = [
  { id: 'company',     label: 'Company Info',      icon: Building2 },
  { id: 'gst',         label: 'GST Details',        icon: FileText },
  { id: 'bank',        label: 'Bank Details',       icon: CreditCard },
  { id: 'invoice',     label: 'Invoice Settings',   icon: Settings2 },
  { id: 'declaration', label: 'Declaration',        icon: MessageSquare },
  { id: 'preview',     label: 'Preview',            icon: Eye },
] as const;

type TabId = typeof TABS[number]['id'];

const defaultTemplate: TaxTemplate = {
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

const SAMPLE_INVOICE: GSTInvoiceData = {
  invoice_number: 'HE/2024-25/001',
  invoice_date: new Date().toISOString(),
  order_type: 'Credit',
  irn: 'abc123xyz456...',
  ack_number: '112630980083377',
  ack_date: new Date().toISOString(),
  buyer_name: 'Sample Customer - Mysore',
  buyer_address: '410/413/49, Hebbal Industria Area\nWeavers Colony, Behind HP Gas\nMysore- 570018',
  buyer_gstin: '29BDPPR3028G1Z6',
  buyer_place_of_supply: 'Karnataka',
  consignee_name: 'Sample Customer - Mysore',
  consignee_address: '410/413/49, Hebbal Industria Area\nWeavers Colony, Behind HP Gas\nMysore- 570018',
  consignee_gstin: '29BDPPR3028G1Z6',
  consignee_place_of_supply: 'Karnataka',
  dispatch: {
    transporter_name: 'Sample Transport',
    dispatch_through: 'Road',
    lr_number: 'LR123456',
    lr_date: new Date().toISOString(),
    vehicle_number: 'KA-09-AB-1234',
    destination: 'Mysore',
    delivery_note: 'DN-001',
    delivery_note_date: new Date().toISOString(),
  },
  items: [
    {
      sr: 1,
      particulars: 'FL NeuSign',
      hsn_code: '39219026',
      gst_percent: 18,
      width: 70,
      length: 10,
      pcs: 16,
      rate_per_sq: 19130.300,
      qty: 2,
      unit: 'sqft',
      amount: 47826.00,
    },
    {
      sr: 2,
      particulars: 'Forwarding Charges- Sale',
      hsn_code: '999799',
      gst_percent: 18,
      qty: 1,
      unit: '',
      amount: 500.00,
    },
  ],
  taxable_value: 50826.00,
  cgst_rate: 9,
  cgst_amount: 4574.34,
  sgst_rate: 9,
  sgst_amount: 4574.34,
  round_off: 0.32,
  grand_total: 59975.00,
};

function InputField({ label, value, onChange, type = 'text', rows }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  rows?: number;
}) {
  const inputClass = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all bg-white";
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>
      {rows ? (
        <textarea
          className={inputClass}
          value={String(value)}
          onChange={e => onChange(e.target.value)}
          rows={rows}
        />
      ) : (
        <input
          type={type}
          className={inputClass}
          value={String(value)}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function UploadField({ label, value, onChange, hint }: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/designs/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Upload failed');
      onChange(data.fileUrl);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{label}</label>
      {hint && <p className="text-[10px] text-slate-400 mb-2">{hint}</p>}
      <div className="flex items-center gap-3">
        {value && <img src={value} alt={label} className="h-12 w-auto border border-slate-200 rounded-lg object-contain" />}
        <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-colors">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? 'Uploading...' : value ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function GSTInvoiceSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [template, setTemplate] = useState<TaxTemplate>(defaultTemplate);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('tax_templates').select('*').eq('is_active', true).limit(1).single();
      if (data) {
        setTemplateId(data.id);
        // Map snake_case DB fields to camelCase TaxTemplate interface
        setTemplate({
          company_name: data.company_name,
          address: data.address,
          city: data.city,
          state: data.state,
          state_code: data.state_code,
          pincode: data.pincode,
          phone: data.phone,
          email: data.email,
          website: data.website || '',
          gstin: data.gstin,
          pan: data.pan,
          msme_reg: data.msme_reg || '',
          bank_name: data.bank_name,
          branch: data.branch,
          account_number: data.account_number,
          ifsc: data.ifsc,
          beneficiary_name: data.beneficiary_name,
          upi_id: data.upi_id || '',
          logo_url: data.logo_url || '',
          signature_url: data.signature_url || '',
          seal_url: data.seal_url || '',
          declaration: data.declaration,
          terms: data.terms,
          footer_text: data.footer_text,
          invoice_prefix: data.invoice_prefix,
          default_gst: data.default_gst,
          round_off: data.round_off,
          amount_in_words: data.amount_in_words ?? true,
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const set = (field: keyof TaxTemplate, value: any) => {
    setTemplate(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        company_name: template.company_name,
        address: template.address,
        city: template.city,
        state: template.state,
        state_code: template.state_code,
        pincode: template.pincode,
        phone: template.phone,
        email: template.email,
        website: template.website,
        gstin: template.gstin,
        pan: template.pan,
        msme_reg: template.msme_reg,
        bank_name: template.bank_name,
        branch: template.branch,
        account_number: template.account_number,
        ifsc: template.ifsc,
        beneficiary_name: template.beneficiary_name,
        upi_id: template.upi_id,
        logo_url: template.logo_url,
        signature_url: template.signature_url,
        seal_url: template.seal_url,
        declaration: template.declaration,
        terms: template.terms,
        footer_text: template.footer_text,
        invoice_prefix: template.invoice_prefix,
        default_gst: template.default_gst,
        round_off: template.round_off,
        amount_in_words: template.amount_in_words,
        updated_at: new Date().toISOString(),
      };

      if (templateId) {
        const { error } = await supabase.from('tax_templates').update(payload).eq('id', templateId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('tax_templates').insert({ ...payload, is_active: true }).select().single();
        if (error) throw error;
        setTemplateId(data.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-1">Admin</p>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">GST &amp; Invoice Settings</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Manage company information used in all GST Tax Invoices</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} /> {saveError}
          </div>
        )}

        {/* Tab Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-1.5 flex flex-wrap gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

          {/* ── COMPANY INFORMATION ── */}
          {activeTab === 'company' && (
            <div className="space-y-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Company Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <InputField label="Company Name" value={template.company_name} onChange={v => set('company_name', v)} />
                <InputField label="Address Line" value={template.address} onChange={v => set('address', v)} />
                <InputField label="City" value={template.city} onChange={v => set('city', v)} />
                <InputField label="State" value={template.state} onChange={v => set('state', v)} />
                <InputField label="State Code" value={template.state_code} onChange={v => set('state_code', v)} />
                <InputField label="PIN Code" value={template.pincode} onChange={v => set('pincode', v)} />
                <InputField label="Phone Number" value={template.phone} onChange={v => set('phone', v)} />
                <InputField label="Email Address" value={template.email} onChange={v => set('email', v)} />
                <InputField label="Website (optional)" value={template.website || ''} onChange={v => set('website', v)} />
              </div>
              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Company Assets</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <UploadField label="Company Logo" value={template.logo_url} onChange={v => set('logo_url', v)} hint="Shown in top-left of invoice" />
                  <UploadField label="Authorized Signature" value={template.signature_url} onChange={v => set('signature_url', v)} hint="Shown in signature block" />
                  <UploadField label="Company Seal" value={template.seal_url} onChange={v => set('seal_url', v)} hint="Shown in signature block" />
                </div>
              </div>
            </div>
          )}

          {/* ── GST DETAILS ── */}
          {activeTab === 'gst' && (
            <div className="space-y-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">GST &amp; Tax Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <InputField label="GSTIN" value={template.gstin} onChange={v => set('gstin', v)} />
                <InputField label="PAN Number" value={template.pan} onChange={v => set('pan', v)} />
                <InputField label="MSME Reg No. (optional)" value={template.msme_reg || ''} onChange={v => set('msme_reg', v)} />
              </div>
            </div>
          )}

          {/* ── BANK DETAILS ── */}
          {activeTab === 'bank' && (
            <div className="space-y-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Bank Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <InputField label="Beneficiary Name" value={template.beneficiary_name} onChange={v => set('beneficiary_name', v)} />
                <InputField label="Bank Name" value={template.bank_name} onChange={v => set('bank_name', v)} />
                <InputField label="Account Number" value={template.account_number} onChange={v => set('account_number', v)} />
                <InputField label="IFSC Code" value={template.ifsc} onChange={v => set('ifsc', v)} />
                <InputField label="Branch" value={template.branch} onChange={v => set('branch', v)} />
                <InputField label="UPI ID (optional)" value={template.upi_id || ''} onChange={v => set('upi_id', v)} />
              </div>
            </div>
          )}

          {/* ── INVOICE SETTINGS ── */}
          {activeTab === 'invoice' && (
            <div className="space-y-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Invoice Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <InputField label="Invoice Prefix (e.g. HE)" value={template.invoice_prefix} onChange={v => set('invoice_prefix', v)} />
                <InputField label="Default GST %" value={template.default_gst} type="number" onChange={v => set('default_gst', parseFloat(v))} />
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Round Off</label>
                  <button
                    onClick={() => set('round_off', !template.round_off)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${template.round_off ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${template.round_off ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Amount in Words</label>
                  <button
                    onClick={() => set('amount_in_words', !template.amount_in_words)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${template.amount_in_words ? 'bg-indigo-600' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${template.amount_in_words ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── DECLARATION ── */}
          {activeTab === 'declaration' && (
            <div className="space-y-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Declaration &amp; Footer</h2>
              <div className="space-y-5">
                <InputField label="Declaration Text" value={template.declaration} onChange={v => set('declaration', v)} rows={3} />
                <InputField label="Terms &amp; Conditions" value={template.terms} onChange={v => set('terms', v)} rows={4} />
                <InputField label="Footer Text" value={template.footer_text} onChange={v => set('footer_text', v)} />
              </div>
            </div>
          )}

          {/* ── LIVE PREVIEW ── */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Live Invoice Preview</h2>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Using sample data</span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-auto bg-white p-4" style={{ maxHeight: '70vh' }}>
                <div style={{ transform: 'scale(0.85)', transformOrigin: 'top left', width: '117%' }}>
                  <GSTInvoiceTemplate template={template} invoice={SAMPLE_INVOICE} />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Bottom Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white text-sm font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle size={16} /> : <Save size={16} />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </RoleGuard>
  );
}
