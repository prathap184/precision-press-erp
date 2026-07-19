'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc, query, orderBy } from '@/lib/supabase-firestore-shim';
import { toast } from 'react-hot-toast';
import { Loader2, Plus, Trash2, Edit3, Image } from 'lucide-react';

interface BankAccount {
  id?: string;
  label: string;
  accountNumber?: string;
  ifsc?: string;
  description?: string;
  qrUrl?: string; // scanner / QR image
  payeeName?: string;
  upiId?: string;
  paymentType?: 'BANK_TRANSFER' | 'QR_PAY' | 'UPI_PAY';
}

export default function AdminPaymentControl() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<BankAccount>({ label: '', accountNumber: '', ifsc: '', description: '', payeeName: '', upiId: '', paymentType: 'BANK_TRANSFER' });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'bankAccounts'), orderBy('label'));
      const snap = await getDocs(q);
      setAccounts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!profile) return toast.error('Not signed in');
    if (!form.label) return toast.error('Label required');

    setSaving(true);
    try {
      const id = `BA-${Date.now().toString().slice(-6)}`;
      let qrUrl = form.qrUrl || '';
      if (file) {
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);

        const response = await fetch('/api/designs/upload', {
          method: 'POST',
          body: uploadFormData,
        });

        const result = await response.json();
        if (!response.ok || !result?.success || !result?.fileUrl) {
          throw new Error(result?.error || 'Cloudinary upload failed');
        }

        qrUrl = result.fileUrl;
      }

      const docRef = doc(db, 'bankAccounts', id);
      await setDoc(docRef, { label: form.label, accountNumber: form.accountNumber || '', ifsc: form.ifsc || '', description: form.description || '', qrUrl, payeeName: form.payeeName || '', upiId: form.upiId || '', paymentType: form.paymentType || 'BANK_TRANSFER' });
      toast.success('Account saved');
      setForm({ label: '', accountNumber: '', ifsc: '', description: '', payeeName: '', upiId: '', paymentType: 'BANK_TRANSFER' });
      setFile(null);
      fetchAccounts();
    } catch (err: any) {
      console.error(err);
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!confirm('Delete this bank account?')) return;
    try {
      await deleteDoc(doc(db, 'bankAccounts', id));
      toast.success('Deleted');
      fetchAccounts();
    } catch (err: any) {
      console.error(err);
      toast.error('Delete failed');
    }
  };

  return (
    <RoleGuard allowedRoles={["ADMIN","SUPER_ADMIN","ACCOUNTANT"]}>
      <div className="max-w-5xl mx-auto py-8">
        <h1 className="text-3xl font-black mb-6">Payment Control</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <form onSubmit={handleSave} className="lg:col-span-2 bg-white p-6 rounded-2xl border">
            <h3 className="font-bold mb-4">Add / Update Bank Account</h3>
            <div className="space-y-3">
              <select value={form.paymentType || 'BANK_TRANSFER'} onChange={e => setForm({...form, paymentType: e.target.value as 'BANK_TRANSFER' | 'QR_PAY' | 'UPI_PAY'})} className="w-full p-3 rounded-2xl border bg-white">
                <option value="BANK_TRANSFER">Direct Bank Transfer</option>
                <option value="QR_PAY">QR Pay</option>
                <option value="UPI_PAY">UPI Pay</option>
              </select>
              <input placeholder="Label (e.g. ICICI — A/C ···5678)" value={form.label} onChange={e => setForm({...form, label: e.target.value})} className="w-full p-3 rounded-2xl border" />
              <input placeholder="Name shown while paying (e.g. PIXEL MARKETING Pvt Ltd)" value={form.payeeName} onChange={e => setForm({...form, payeeName: e.target.value})} className="w-full p-3 rounded-2xl border" />
              <input placeholder="UPI ID (optional)" value={form.upiId} onChange={e => setForm({...form, upiId: e.target.value})} className="w-full p-3 rounded-2xl border" />
              <input placeholder="Account Number" value={form.accountNumber} onChange={e => setForm({...form, accountNumber: e.target.value})} className="w-full p-3 rounded-2xl border" />
              <input placeholder="IFSC" value={form.ifsc} onChange={e => setForm({...form, ifsc: e.target.value})} className="w-full p-3 rounded-2xl border" />
              <input placeholder="Branch / Description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full p-3 rounded-2xl border" />

              <div>
                <label className="text-xs font-black uppercase text-slate-500">Upload QR / Scanner Image to Cloudinary (optional)</label>
                <input type="file" accept="image/*" onChange={handleFile} className="mt-2" />
              </div>

              <div className="flex gap-2 mt-4">
                <button disabled={saving} className="bg-blue-600 text-white px-4 h-11 rounded-2xl font-bold">
                  {saving ? <><Loader2 className="animate-spin inline-block mr-2"/>Saving...</> : <><Plus className="inline-block mr-2"/> Save Account</>}
                </button>
              </div>
            </div>
          </form>

          <aside className="bg-slate-50 p-6 rounded-2xl border">
            <h4 className="font-bold mb-4">How It Works</h4>
            <ol className="text-sm space-y-3">
              <li>1. Add bank accounts and upload a QR/scanner image for UPI payments.</li>
              <li>2. Accounts are visible to customers on the Payment Request page.</li>
              <li>3. Accountant can mark payments approved from the Payments approvals area.</li>
            </ol>
          </aside>
        </div>

        <section className="mt-10 bg-white p-6 rounded-2xl border">
          <h3 className="font-bold mb-4">Existing Bank Accounts</h3>
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="animate-spin mx-auto" /></div>
          ) : (
            <div className="space-y-4">
              {accounts.length === 0 && <p className="text-sm text-slate-500">No accounts yet.</p>}
              {accounts.map(a => (
                <div key={a.id} className="flex items-center justify-between p-4 border rounded-2xl">
                  <div>
                    <div className="font-bold">
                      {a.paymentType === 'QR_PAY'
                        ? `QR Pay — ${a.payeeName || a.label}`
                        : a.paymentType === 'UPI_PAY'
                          ? `UPI Pay — ${a.payeeName || a.label}`
                          : a.label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {a.payeeName ? `Pay to: ${a.payeeName}` : ''}
                      {a.upiId ? `${a.payeeName ? ' • ' : ''}UPI: ${a.upiId}` : ''}
                      {a.accountNumber ? `${a.payeeName || a.upiId ? ' • ' : ''}${a.accountNumber}` : ''}
                      {a.ifsc ? ` • ${a.ifsc}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.qrUrl ? <a href={a.qrUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 flex items-center gap-2"><Image size={14} /> View QR</a> : <span className="text-xs text-slate-400">No QR</span>}
                    <button onClick={() => { setForm({ label: a.label, accountNumber: a.accountNumber, ifsc: a.ifsc, description: a.description, qrUrl: a.qrUrl, payeeName: a.payeeName, upiId: a.upiId, paymentType: a.paymentType || 'BANK_TRANSFER' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-2 rounded-full bg-slate-100"><Edit3 size={14} /></button>
                    <button onClick={() => handleDelete(a.id)} className="p-2 rounded-full bg-red-50 text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </RoleGuard>
  );
}

