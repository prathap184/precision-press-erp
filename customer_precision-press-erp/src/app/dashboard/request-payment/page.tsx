'use client';


import React, { useEffect, useState } from 'react';
import { 
  CreditCard, 
  Building2, 
  Calendar, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Landmark
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, orderBy } from '@/lib/supabase-firestore-shim';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { useRouter } from 'next/navigation';
import { submitPayment } from '@/lib/actions/payments';
import { toast } from 'react-hot-toast';
import { refreshAuthTokenCookie } from '@/lib/refresh-auth-token';

type BankAccount = {
  id?: string;
  label: string;
  accountNumber?: string;
  ifsc?: string;
  description?: string;
  qrUrl?: string;
  payeeName?: string;
  upiId?: string;
  paymentType?: 'BANK_TRANSFER' | 'QR_PAY' | 'UPI_PAY';
};

export default function RequestPaymentPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [formData, setFormData] = useState({
    amount: '',
    referenceNumber: '',
    depositDate: new Date().toISOString().split('T')[0],
    bankName: '',
    branchName: '',
    ourBankAccount: ''
  });

  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;
    const fetchBankAccounts = async () => {
      try {
        const q = query(collection(db, 'bankAccounts'), orderBy('label'));
        const snap = await getDocs(q);
        setBankAccounts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      } catch (err) {
        console.warn('Failed to load bank accounts', err);
      }
    };

    fetchBankAccounts();
  }, [profile?.uid]);

  const selectedPaymentAccount = bankAccounts.find(account => account.id === formData.ourBankAccount);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);
    setError(null);

    if (!file) {
      setLoading(false);
      setError('Payment screenshot is required.');
      toast.error('Payment screenshot is required.');
      return;
    }

    try {
      await refreshAuthTokenCookie();

      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('folder', `payment_proofs/${profile.uid}`);

      const uploadResponse = await fetch('/api/designs/upload', {
        method: 'POST',
        body: uploadData,
      });
      const uploadResult = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadResult.fileUrl) {
        throw new Error(uploadResult.error || 'Payment proof upload failed.');
      }

      const proofUrl = uploadResult.fileUrl;

      const res = await submitPayment({
        orderId: 'GENERAL',
        paymentMode: selectedPaymentAccount?.paymentType || 'UPI_PAY',
        amount: parseFloat(formData.amount),
        ourBankAccount: formData.ourBankAccount,
        depositDate: formData.depositDate,
        depositBank: formData.bankName,
        branchName: formData.branchName,
        proofDriveLink: proofUrl || '',
        remarks: `Request Credit Submission`,
        depositRefNo: formData.referenceNumber,
      });

      if (!res.success) throw new Error(res.error || 'Submission failed');

      setSuccess(true);
      toast.success('Request submitted — accountant will review');
      setTimeout(() => router.push('/dashboard/ledger'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit payment request.');
      toast.error(err.message || 'Submission failed.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center text-center animate-in zoom-in duration-500">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-8 shadow-2xl shadow-green-500/20">
          <CheckCircle className="text-white" size={48} />
        </div>
        <h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-900 mb-4">Request Sent!</h2>
        <p className="text-slate-500 font-bold max-w-sm">Your credit request has been submitted to Accounts for review.</p>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["CUSTOMER"]}>
      <div className="max-w-6xl mx-auto space-y-4 pb-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <section>
          <h1 className="text-[28px] font-bold md:text-3xl font-black font-display text-slate-900 tracking-tighter italic uppercase underline decoration-blue-500 underline-offset-6">New Payment Request</h1>
          <p className="text-slate-400 font-medium mt-1 max-w-lg opacity-60 text-[11px]">Request credit or report a deposit — upload proof and accounts will verify.</p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.95fr)] gap-5 items-start">
          <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 md:p-5 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard size={12} className="text-blue-500" /> Payment Mode
                </label>
                <select
                  required
                  value={formData.ourBankAccount}
                  onChange={(e) => setFormData({...formData, ourBankAccount: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-slate-700 appearance-none focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all cursor-pointer"
                >
                  <option value="">— Select Payment Mode —</option>
                  {bankAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.paymentType === 'QR_PAY'
                        ? `Pay by QR — ${account.payeeName || account.label}`
                        : account.paymentType === 'UPI_PAY'
                          ? `Pay by UPI — ${account.payeeName || account.label}`
                          : `Direct Bank Transfer — ${account.label}${account.ifsc ? ` · IFSC: ${account.ifsc}` : ''}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText size={12} className="text-blue-500" /> Amount (INR)
                </label>
                <input 
                  type="number"
                  required
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all font-display"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck size={12} className="text-blue-500" /> UTR / Ref Number / Cheque No.
                </label>
                <input 
                  type="text"
                  placeholder="Enter Transaction ID"
                  value={formData.referenceNumber}
                  onChange={(e) => setFormData({...formData, referenceNumber: e.target.value.toUpperCase()})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all uppercase placeholder:normal-case"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={12} className="text-blue-500" /> Deposit Date
                </label>
                <input 
                  type="date"
                  required
                  value={formData.depositDate}
                  onChange={(e) => setFormData({...formData, depositDate: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Landmark size={12} className="text-blue-500" /> Deposited Bank
                </label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. SBI, HDFC, ICICI"
                  value={formData.bankName}
                  onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck size={12} className="text-blue-500" /> Our Bank Account
                </label>
                <select 
                  required
                  value={formData.ourBankAccount}
                  onChange={(e) => setFormData({...formData, ourBankAccount: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-slate-700 appearance-none focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all cursor-pointer"
                >
                  <option value="">Select Recipient Bank</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Building2 size={12} className="text-blue-500" /> Branch Name (Optional)
                </label>
                <input 
                  type="text"
                  placeholder="Enter branch location"
                  value={formData.branchName}
                  onChange={(e) => setFormData({...formData, branchName: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1">
                <FileText size={12} className="text-blue-500" /> Payment Proof — Upload Screenshot
              </label>
              <input type="file" accept="image/*" required onChange={handleFile} className="w-full text-[11px]" />
            </div>

            {error && (
              <div className="flex items-center gap-3 bg-red-50 p-4 rounded-2xl border border-red-100">
                <AlertCircle className="text-red-500 shrink-0" size={20} />
                <p className="text-[11px] font-bold text-red-900 italic tracking-tight">{error}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white h-12 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.25em] flex items-center justify-center gap-3 shadow-2xl hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Requesting...
                </>
              ) : (
                <>
                  Submit Request
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Tips / Policy Sidebar */}
          <div className="space-y-4 lg:sticky lg:top-4">
             <div className="bg-slate-50 p-4 rounded-[2rem] border border-slate-100">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 italic">Our Bank Accounts</h4>
                <div className="space-y-2.5">
                  {selectedPaymentAccount ? (
                    <>
                      <div className="p-3 bg-white/0 rounded-xl border border-slate-100">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{selectedPaymentAccount.paymentType === 'QR_PAY' ? 'QR Pay' : selectedPaymentAccount.paymentType === 'UPI_PAY' ? 'UPI Pay' : 'Bank Transfer'}</div>
                        <div className="mt-1.5 text-sm font-bold text-slate-800 leading-tight">{selectedPaymentAccount.label}</div>
                        {selectedPaymentAccount.payeeName && <div className="text-[11px] text-slate-500 mt-1">Pay to: {selectedPaymentAccount.payeeName}</div>}
                        {selectedPaymentAccount.upiId && <div className="text-[11px] text-slate-500 mt-0.5">UPI ID: {selectedPaymentAccount.upiId}</div>}
                        {selectedPaymentAccount.accountNumber && <div className="text-[11px] text-slate-500 mt-0.5">A/C: {selectedPaymentAccount.accountNumber}</div>}
                        {selectedPaymentAccount.ifsc && <div className="text-[11px] text-slate-500 mt-0.5">IFSC: {selectedPaymentAccount.ifsc}</div>}
                      </div>
                      {selectedPaymentAccount.qrUrl ? (
                        <div className="rounded-[1.5rem] overflow-hidden border border-slate-200 bg-white shadow-sm p-3 flex items-center justify-center">
                          <div className="w-full max-w-[280px] aspect-square bg-white flex items-center justify-center">
                            <img
                              src={selectedPaymentAccount.qrUrl}
                              alt={selectedPaymentAccount.payeeName || selectedPaymentAccount.label}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-xs text-slate-400">Select a payment mode to show QR or bank details.</div>
                  )}
                  {bankAccounts.length === 0 && <div className="text-xs text-slate-400">No accounts configured yet.</div>}
                </div>
             </div>

             <div className="bg-blue-600 p-4 rounded-[2rem] text-white shadow-2xl shadow-blue-500/30">
               <ShieldCheck className="mb-3 opacity-60" size={24} />
               <h4 className="text-sm font-black italic uppercase tracking-tight mb-2 leading-tight">Verification Policy</h4>
               <ul className="space-y-3 text-[10px] font-bold text-blue-100 leading-relaxed uppercase tracking-wider">
                  <li className="flex gap-4">
                    <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 shrink-0" />
                    Payments are usually verified within 2-4 business hours.
                  </li>
                  <li className="flex gap-4">
                    <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 shrink-0" />
                    Always ensure UTR or Cheque numbers match your bank records exactly.
                  </li>
                  <li className="flex gap-4">
                    <div className="w-1.5 h-1.5 bg-white rounded-full mt-1.5 shrink-0" />
                    False reporting may lead to immediate suspension of credit account.
                  </li>
                </ul>
             </div>
          </div>

        </div>

      </div>
    </RoleGuard>
  );
}

