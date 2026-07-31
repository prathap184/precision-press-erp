'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import { BankAccountItem, getBankAccounts, saveBankAccount, deleteBankAccount } from '@/lib/actions/bank-accounts';
import { toast } from 'react-hot-toast';
import { 
  Loader2, Plus, Trash2, Edit3, Image as ImageIcon, Building2, 
  Search, Copy, Check, QrCode, CreditCard, ShieldCheck, Wallet, ArrowUpRight, X, ExternalLink
} from 'lucide-react';

export default function BankAccountsPage() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<BankAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal & Edit State
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewQrUrl, setPreviewQrUrl] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState<BankAccountItem>({
    label: '',
    accountNumber: '',
    ifsc: '',
    description: '',
    payeeName: '',
    upiId: '',
    paymentType: 'BANK_TRANSFER',
    opening_balance: '0.00',
    qrUrl: ''
  });
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const data = await getBankAccounts();
      setAccounts(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({
      label: '',
      accountNumber: '',
      ifsc: '',
      description: '',
      payeeName: 'Hindustan Enterprices',
      upiId: '',
      paymentType: 'BANK_TRANSFER',
      opening_balance: '0.00',
      qrUrl: ''
    });
    setFile(null);
    setIsOpen(true);
  };

  const handleOpenEdit = (acc: BankAccountItem) => {
    setEditingId(acc.id || null);
    setForm({
      id: acc.id,
      label: acc.label || '',
      accountNumber: acc.accountNumber || '',
      ifsc: acc.ifsc || '',
      description: acc.description || '',
      payeeName: acc.payeeName || '',
      upiId: acc.upiId || '',
      paymentType: acc.paymentType || 'BANK_TRANSFER',
      opening_balance: acc.opening_balance?.toString() || '0.00',
      qrUrl: acc.qrUrl || ''
    });
    setFile(null);
    setIsOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return toast.error('Not signed in');
    if (!form.label.trim()) return toast.error('Account Label / Bank Name is required');

    setSaving(true);
    try {
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
          throw new Error(result?.error || 'QR Image upload failed');
        }

        qrUrl = result.fileUrl;
      }

      const payload: BankAccountItem = {
        ...form,
        qrUrl,
        opening_balance: form.opening_balance || '0.00'
      };
      if (editingId) {
        payload.id = editingId;
      }

      const res = await saveBankAccount(payload);
      if (!res.success) {
        throw new Error(res.error || 'Failed to save account');
      }

      toast.success(editingId ? 'Bank account updated successfully!' : 'New bank account added successfully!');
      setIsOpen(false);
      fetchAccounts();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to save bank account');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string, label?: string) => {
    if (!id) return;
    if (!confirm(`Are you sure you want to delete "${label || id}"?`)) return;
    try {
      const res = await deleteBankAccount(id);
      if (!res.success) throw new Error(res.error);
      toast.success('Bank account removed');
      fetchAccounts();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to delete account');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (a.label || '').toLowerCase().includes(q) ||
        (a.payeeName || '').toLowerCase().includes(q) ||
        (a.accountNumber || '').toLowerCase().includes(q) ||
        (a.ifsc || '').toLowerCase().includes(q) ||
        (a.upiId || '').toLowerCase().includes(q)
      );
    });
  }, [accounts, search]);

  // Statistics
  const totalOpeningBalance = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + (parseFloat(acc.opening_balance?.toString() || '0') || 0), 0);
  }, [accounts]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']}>
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        
        {/* Page Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Company Finance</p>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Bank Accounts Control</h1>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            <span>Add Bank Account</span>
          </button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Accounts</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{accounts.length}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Opening Balance</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-600 mt-2">{formatCurrency(totalOpeningBalance)}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active UPI Identifiers</span>
              <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                <QrCode className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">
              {accounts.filter(a => Boolean(a.upiId || a.qrUrl)).length}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Bank Name, Account Number, Payee, or UPI ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Bank Accounts Grid / Cards */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
            <p className="text-sm font-medium text-slate-500">Loading bank accounts...</p>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 text-center p-6">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 text-slate-400">
              <Building2 className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800">No Bank Accounts Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6">
              {search ? 'No bank accounts match your search query.' : 'Add your company bank accounts to manage payment collections and ledgers.'}
            </p>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-md hover:bg-indigo-700 transition-all"
            >
              + Add First Bank Account
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAccounts.map((acc) => (
              <div 
                key={acc.id} 
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col justify-between relative group"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 to-indigo-900 text-white font-black text-sm flex items-center justify-center shadow-md">
                        {acc.label.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-base leading-tight">{acc.label}</h3>
                        <p className="text-xs text-slate-500 font-medium truncate max-w-[180px]">{acc.payeeName || 'Hindustan Enterprices'}</p>
                      </div>
                    </div>

                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                      acc.paymentType === 'QR_PAY' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      acc.paymentType === 'UPI_PAY' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {acc.paymentType === 'QR_PAY' ? 'QR Pay' : acc.paymentType === 'UPI_PAY' ? 'UPI Pay' : 'Bank Transfer'}
                    </span>
                  </div>

                  {/* Details List */}
                  <div className="space-y-2.5 pt-3 border-t border-slate-100 text-xs">
                    {acc.accountNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">A/C Number:</span>
                        <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                          <span>{acc.accountNumber}</span>
                          <button 
                            onClick={() => copyToClipboard(acc.accountNumber!, `acc-${acc.id}`)}
                            title="Copy Account Number"
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                            {copiedId === `acc-${acc.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {acc.ifsc && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">IFSC Code:</span>
                        <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                          <span>{acc.ifsc}</span>
                          <button 
                            onClick={() => copyToClipboard(acc.ifsc!, `ifsc-${acc.id}`)}
                            title="Copy IFSC"
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                            {copiedId === `ifsc-${acc.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {acc.upiId && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">UPI ID:</span>
                        <div className="flex items-center gap-1 font-mono font-bold text-indigo-700">
                          <span>{acc.upiId}</span>
                          <button 
                            onClick={() => copyToClipboard(acc.upiId!, `upi-${acc.id}`)}
                            title="Copy UPI ID"
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                            {copiedId === `upi-${acc.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400 font-medium">Opening Balance:</span>
                      <span className="font-bold text-emerald-600">{formatCurrency(parseFloat(acc.opening_balance?.toString() || '0'))}</span>
                    </div>

                    {acc.description && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg italic">
                        "{acc.description}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  {acc.qrUrl ? (
                    <button 
                      onClick={() => setPreviewQrUrl(acc.qrUrl!)}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>View QR Scanner</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">No QR Code</span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(acc)}
                      title="Edit Bank Account"
                      className="p-2 text-slate-600 hover:bg-slate-100 hover:text-indigo-600 rounded-xl transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(acc.id, acc.label)}
                      title="Delete Bank Account"
                      className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit Modal Drawer */}
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    {editingId ? 'Edit Bank Account' : 'Add New Bank Account'}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {editingId ? 'Update details for this bank account.' : 'Enter account details to collect payments and manage ledgers.'}
                  </p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Account Nickname / Bank Label *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SBI Main, ICICI Current"
                    value={form.label}
                    onChange={e => setForm({ ...form, label: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Payment Type
                    </label>
                    <select
                      value={form.paymentType || 'BANK_TRANSFER'}
                      onChange={e => setForm({ ...form, paymentType: e.target.value as any })}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    >
                      <option value="BANK_TRANSFER">Direct Bank Transfer</option>
                      <option value="UPI_PAY">UPI Pay</option>
                      <option value="QR_PAY">QR Scanner Pay</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Opening Balance (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={form.opening_balance}
                      onChange={e => setForm({ ...form, opening_balance: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Payee / Account Holder Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Hindustan Enterprices"
                    value={form.payeeName}
                    onChange={e => setForm({ ...form, payeeName: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 973564778283284774643"
                      value={form.accountNumber}
                      onChange={e => setForm({ ...form, accountNumber: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SSDR223344"
                      value={form.ifsc}
                      onChange={e => setForm({ ...form, ifsc: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    UPI ID (VPA)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HindustanEnterprices@icici"
                    value={form.upiId}
                    onChange={e => setForm({ ...form, upiId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-indigo-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Branch / Notes / Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Main Branch, Hosur Road"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    QR Code Scanner Image (Optional Upload)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                  {form.qrUrl && !file && (
                    <p className="text-[11px] text-indigo-600 mt-1 font-medium truncate">
                      Current QR: {form.qrUrl}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{editingId ? 'Update Bank Account' : 'Save Bank Account'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* QR Code Image Preview Modal */}
        {previewQrUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl relative">
              <button
                onClick={() => setPreviewQrUrl(null)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="font-black text-slate-900 text-lg">QR Payment Scanner</h3>
              <div className="bg-slate-50 p-4 rounded-2xl border flex items-center justify-center">
                <img 
                  src={previewQrUrl} 
                  alt="QR Code" 
                  className="max-h-72 object-contain rounded-xl shadow-sm" 
                />
              </div>
              <a
                href={previewQrUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs font-bold text-indigo-600 hover:underline"
              >
                <span>Open Full Size Image</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

      </div>
    </RoleGuard>
  );
}
