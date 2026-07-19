'use client';


import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Building2, 
  Calendar, 
  Hash, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Landmark
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs,
  orderBy
} from '@/lib/supabase-firestore-shim';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { useRouter } from 'next/navigation';
import { useEffectiveUser } from '@/lib/impersonation-context';
import { submitPayment } from '@/lib/actions/payments';
import { toast } from 'react-hot-toast';
import { refreshAuthTokenCookie } from '@/lib/refresh-auth-token';

const OUR_BANKS = [
  { id: 'ICICI_001', label: 'ICICI Bank — A/C ···5678' },
  { id: 'SBI_001',   label: 'SBI — A/C ···4567' },
  { id: 'HDFC_001',  label: 'HDFC Bank — A/C ···8901' },
  { id: 'KOTAK_001', label: 'Kotak Mahindra — A/C ···2345' },
];

export default function CustomerPaymentPage() {
  const { profile } = useAuth();
  const { effectiveUserId, isImpersonating, simulatedUser } = useEffectiveUser(profile?.uid);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    orderId: '',
    paymentMode: 'UPI',
    amount: '',
    referenceNumber: '',
    depositDate: new Date().toISOString().split('T')[0],
    bankName: '',
    branchName: '',
    ourBankAccount: ''
  });

  useEffect(() => {
    if (!effectiveUserId) return;
    const fetchOrders = async () => {
      const q = query(
        collection(db, 'orders'),
        where('customerId', '==', effectiveUserId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setRecentOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchOrders();
  }, [effectiveUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;
    
    setLoading(true);
    setError(null);

    try {
      await refreshAuthTokenCookie();

      const res = await submitPayment({
        orderId: formData.orderId,
        paymentMode: formData.paymentMode,
        amount: parseFloat(formData.amount),
        ourBankAccount: formData.ourBankAccount,
        depositDate: formData.depositDate,
        depositBank: formData.bankName,
        branchName: formData.branchName,
        proofDriveLink: 'https://drive.google.com/placeholder-audit', // Placeholder if not provided, or add field
        remarks: isImpersonating ? `Admin Proxy: ${profile?.name}` : '',
        depositRefNo: formData.referenceNumber,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to submit payment.');
      }
      
      setSuccess(true);
      toast.success('Payment reported successfully!');
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
        <h2 className="text-4xl font-black italic uppercase tracking-tighter text-slate-900 mb-4">Payment Reported!</h2>
        <p className="text-slate-500 font-bold max-w-sm">
          Your payment verification request has been sent to our accounts department. It will reflect in your ledger once verified.
        </p>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={['CUSTOMER']}>
      <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        <section>
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-4">Financial Portal</p>
          <h1 className="text-4xl font-black font-display text-slate-900 tracking-tighter italic uppercase underline decoration-blue-500 underline-offset-8">Report Payment</h1>
          <p className="text-slate-400 font-medium mt-4 max-w-lg opacity-60">
            Submit your deposit details (UTR, Cheque, or Transfer) to update your account balance and clear dues.
          </p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
          
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-8 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/50">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Order Selection */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Hash size={12} className="text-blue-500" /> Reference Order / Account
                </label>
                <select 
                  required
                  value={formData.orderId}
                  onChange={(e) => setFormData({...formData, orderId: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 appearance-none focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all cursor-pointer"
                >
                  <option value="">Select Order (Optional)</option>
                  <option value="GENERAL">General Account Deposit</option>
                  {recentOrders.map(o => (
                    <option key={o.id} value={o.id}>{o.id} — {(o.amounts?.grandTotal || 0).toLocaleString()} INR</option>
                  ))}
                </select>
              </div>

              {/* Payment Mode */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard size={12} className="text-blue-500" /> Payment Mode
                </label>
                <select 
                  required
                  value={formData.paymentMode}
                  onChange={(e) => setFormData({...formData, paymentMode: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 appearance-none focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all cursor-pointer"
                >
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="BANK_TRANSFER">IMPS / NEFT / RTGS</option>
                  <option value="CHEQUE">Cheque / Demand Draft</option>
                  <option value="CASH">Cash Deposit</option>
                </select>
              </div>

              {/* Amount */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText size={12} className="text-blue-500" /> Amount (INR)
                </label>
                <input 
                  type="number"
                  required
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all font-display"
                />
              </div>

              {/* Reference Number */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck size={12} className="text-blue-500" /> UTR / Ref Number / Cheque No.
                </label>
                <input 
                  type="text"
                  required
                  placeholder="Enter Transaction ID"
                  value={formData.referenceNumber}
                  onChange={(e) => setFormData({...formData, referenceNumber: e.target.value.toUpperCase()})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all uppercase placeholder:normal-case"
                />
              </div>

              {/* Date */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={12} className="text-blue-500" /> Deposit Date
                </label>
                <input 
                  type="date"
                  required
                  value={formData.depositDate}
                  onChange={(e) => setFormData({...formData, depositDate: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all"
                />
              </div>

              {/* Bank Name */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Landmark size={12} className="text-blue-500" /> Deposited Bank
                </label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. SBI, HDFC, ICICI"
                  value={formData.bankName}
                  onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all"
                />
              </div>

              {/* Our Bank Selection */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck size={12} className="text-blue-500" /> Our Bank Account
                </label>
                <select 
                  required
                  value={formData.ourBankAccount}
                  onChange={(e) => setFormData({...formData, ourBankAccount: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 appearance-none focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all cursor-pointer"
                >
                  <option value="">Select Recipient Bank</option>
                  {OUR_BANKS.map(b => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </div>

              {/* Branch Name */}
              <div className="space-y-3 md:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Building2 size={12} className="text-blue-500" /> Branch Name (Optional)
                </label>
                <input 
                  type="text"
                  placeholder="Enter branch location"
                  value={formData.branchName}
                  onChange={(e) => setFormData({...formData, branchName: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-400 transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-4 bg-red-50 p-6 rounded-3xl border border-red-100">
                <AlertCircle className="text-red-500 shrink-0" size={20} />
                <p className="text-xs font-bold text-red-900 italic tracking-tight">{error}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white h-20 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.4em] flex items-center justify-center gap-4 shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Verifying Protocol...
                </>
              ) : (
                <>
                  Confirm Payment Report
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Tips / Policy Sidebar */}
          <div className="space-y-8">
             <div className="bg-blue-600 p-10 rounded-[3rem] text-white shadow-2xl shadow-blue-500/30">
                <ShieldCheck className="mb-6 opacity-60" size={32} />
                <h4 className="text-xl font-black italic uppercase tracking-tight mb-4 leading-tight">Verification Policy</h4>
                <ul className="space-y-6 text-[10px] font-bold text-blue-100 leading-relaxed uppercase tracking-wider">
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

             <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 italic">Support Desk</h4>
                <p className="text-xs font-medium text-slate-600 leading-relaxed">
                  Need help with matching transactions? Our accountant is available from 10 AM to 7 PM.
                </p>
                <button className="mt-8 text-[9px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 hover:gap-4 transition-all">
                  Chat with Accounts <ChevronRight size={10} />
                </button>
             </div>
          </div>

        </div>

      </div>
    </RoleGuard>
  );
}

