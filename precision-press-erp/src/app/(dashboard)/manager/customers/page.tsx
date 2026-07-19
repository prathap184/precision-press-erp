'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { User, Shield, CreditCard, Plus, Search, Mail, Phone, Lock, Eye, EyeOff, CheckCircle, Trash2, Edit3, Trash, X } from 'lucide-react';
import { UserProfile } from '@/types/auth';
import { toast } from 'react-hot-toast';

export default function CustomerManagementPage() {
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPending, setFilterPending] = useState(false);
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    businessName: '',
    phone: '',
    address: '',
    customerType: 'CASH' as 'CASH' | 'CREDIT',
    creditLimit: 0,
    initialBalance: 0,
    tempPassword: `PP-${Math.floor(Math.random() * 90000) + 10000}`
  });

  const [editingCustomer, setEditingCustomer] = useState<UserProfile | null>(null);
  const [adjustingCredit, setAdjustingCredit] = useState<UserProfile | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentType, setAdjustmentType] = useState<'DEBIT' | 'CREDIT'>('CREDIT');
  const [adjustmentRemarks, setAdjustmentRemarks] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
         const { getCustomers } = await import('@/lib/actions/users');
         const data = await getCustomers();
      setCustomers(data);
    } catch (error) {
      toast.error("Cloud vault synchronization failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
         const { createCustomer } = await import('@/lib/actions/users');
         const result = await createCustomer(formData);
      if (result.success) {
        toast.success("Identity established in secure ledger");
        setShowAddModal(false);
        setShowSuccessModal({
          name: formData.name,
          email: formData.email,
          tempPassword: formData.tempPassword,
          customerType: formData.customerType
        });
        fetchData();
        // Reset form
        setFormData({
          email: '',
          name: '',
          businessName: '',
          phone: '',
          address: '',
          customerType: 'CASH',
          creditLimit: 0,
          initialBalance: 0,
          tempPassword: `PP-${Math.floor(Math.random() * 90000) + 10000}`
        });
      } else {
        toast.error(result.error || 'Vault entry failed.');
      }
    } catch (error) {
      toast.error("Vault entry failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setIsSubmitting(true);
    try {
      const { updateCustomerProfile } = await import('@/lib/actions/users');
      const res = await updateCustomerProfile(editingCustomer.uid, editingCustomer);
      if (res.success) {
        toast.success("Profile updated effectively");
        setEditingCustomer(null);
        fetchData();
      } else {
        toast.error(res.error);
      }
    } catch (e) {
      toast.error("Profile sync failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingCredit) return;
    setIsSubmitting(true);
    try {
      const { adjustCustomerCredit } = await import('@/lib/actions/users');
      const res = await adjustCustomerCredit(adjustingCredit.uid, adjustmentAmount, adjustmentType, adjustmentRemarks);
      if (res.success) {
        toast.success("Balance ledger updated");
        setAdjustingCredit(null);
        setAdjustmentAmount(0);
        setAdjustmentRemarks('');
        fetchData();
      } else {
        toast.error(res.error);
      }
    } catch (e) {
      toast.error("Ledger update failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (uid: string, current: string) => {
    const next = current === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
      const { updateCustomerStatus } = await import('@/lib/actions/users');
      const res = await updateCustomerStatus(uid, next);
    if (res.success) {
      toast.success(`User ${next.toLowerCase()}ed`);
      fetchData();
    }
  };

  const filtered = customers.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.email?.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterPending) {
      return matchesSearch && c.customerType === 'CREDIT' && c.creditStatus === 'PENDING_APPROVAL';
    }
    return matchesSearch;
  });

  const handleApproveCredit = async (uid: string) => {
    const { updateCustomerProfile } = await import('@/lib/actions/users');
    const res = await updateCustomerProfile(uid, { creditStatus: 'APPROVED' });
    if (res.success) {
      toast.success("Credit account approved");
      fetchData();
    } else {
      toast.error(res.error || "Approval failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 lg:p-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="bg-indigo-600 p-1.5 rounded shadow-sm">
                <Shield className="text-white" size={14} />
             </div>
             <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Admin Control Hub</p>
          </div>
          <h1 className="text-[28px] font-bold font-bold text-slate-900 tracking-tight">
             Customer <span className="text-indigo-600">Directory</span>
          </h1>
        </div>

        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded font-bold uppercase text-[11px] tracking-wider shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          <Plus size={16} strokeWidth={3} />
          Provision New Account
        </button>
      </div>

      {/* Stats Quick View - High Density */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded border border-slate-200 flex items-center gap-4 shadow-sm">
           <div className="w-10 h-10 bg-indigo-50 rounded flex items-center justify-center text-indigo-600">
              <User size={20} />
           </div>
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Nodes</p>
              <h3 className="text-xl font-bold text-slate-900">{customers.length}</h3>
           </div>
        </div>
        <div className="bg-white p-4 rounded border border-slate-200 flex items-center gap-4 shadow-sm">
           <div className="w-10 h-10 bg-emerald-50 rounded flex items-center justify-center text-emerald-600">
              <Shield size={20} />
           </div>
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Channels</p>
              <h3 className="text-xl font-bold text-slate-900">{customers.filter(c => c.status === 'ACTIVE').length}</h3>
           </div>
        </div>
        <div className="bg-white p-4 rounded border border-slate-200 flex items-center gap-4 shadow-sm">
           <div className="w-10 h-10 bg-amber-50 rounded flex items-center justify-center text-amber-600">
              <CreditCard size={20} />
           </div>
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Exposure</p>
              <h3 className="text-xl font-bold text-slate-900">₹{customers.reduce((acc, c) => acc + (c.creditLimit || 0), 0).toLocaleString()}</h3>
           </div>
        </div>
      </div>

      {/* Main Directory - High Density Table */}
      <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden">
         {/* Table Search */}
         <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="relative w-full md:w-80">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
               <input 
                type="text" 
                placeholder="Filter identity vault..."
                className="w-full bg-white border border-slate-200 rounded pl-9 pr-4 h-11 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
               />
            </div>
            <button
               onClick={() => setFilterPending(!filterPending)}
               className={`px-3 py-2 text-xs font-bold rounded uppercase tracking-wider transition-all border ${
                 filterPending 
                 ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm' 
                 : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
               }`}
            >
               {filterPending ? 'Showing Pending Approvals' : 'Filter Pending Approvals'}
            </button>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
               Displaying {filtered.length} Entities
            </div>
         </div>

         {loading ? (
           <div className="p-12 flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-2 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synchronizing Vault Data...</p>
           </div>
         ) : (
           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                       <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Entity Details</th>
                       <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Connectivity</th>
                       <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                       <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Credit Allocation</th>
                       <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                       <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Operations</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {filtered.map((customer) => (
                      <tr key={customer.uid} className="hover:bg-slate-50/80 transition-colors group border-b border-slate-50">
                        <td className="px-4 py-3 tabular-nums">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                                 {customer.businessName?.charAt(0) || customer.name?.charAt(0)}
                              </div>
                              <div>
                                 <p className="text-xs font-bold text-slate-900">{customer.businessName || 'N/A'}</p>
                                 <p className="text-[10px] text-slate-500">{customer.name}</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                           <div className="space-y-0.5">
                              <p className="text-[10px] font-medium text-slate-600 flex items-center gap-1.5">
                                 <Mail size={10} className="text-slate-400" />
                                 {customer.email}
                              </p>
                              <p className="text-[10px] font-medium text-slate-600 flex items-center gap-1.5">
                                 <Phone size={10} className="text-slate-400" />
                                 {customer.phone || 'No phone'}
                              </p>
                           </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                           <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                             customer.customerType === 'CREDIT' 
                             ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                             : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                           }`}>
                              {customer.customerType}
                           </span>
                           {customer.customerType === 'CREDIT' && customer.creditStatus === 'PENDING_APPROVAL' && (
                             <span className="block mt-1 text-[8px] font-bold text-amber-600 uppercase tracking-widest">
                               Pending Approval
                             </span>
                           )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                           <div className="inline-block text-right">
                              <p className="text-[11px] font-bold text-slate-900">₹{(customer.creditLimit || 0).toLocaleString()}</p>
                              <div className="w-16 h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden ml-auto">
                                 <div 
                                  className="h-full bg-indigo-500 rounded-full"
                                  style={{ width: `${Math.min(100, (customer.usedCredit || 0) / (customer.creditLimit || 1) * 100)}%` }}
                                 ></div>
                              </div>
                              <p className="text-[9px] font-medium text-slate-400 uppercase mt-1">
                                 Used: ₹{(customer.usedCredit || 0).toLocaleString()}
                              </p>
                           </div>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums">
                           <div className="flex items-center justify-center gap-1.5">
                              <div className={`w-1.5 h-1.5 rounded-full ${customer.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                              <p className={`text-[9px] font-bold uppercase tracking-wider ${customer.status === 'ACTIVE' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                 {customer.status}
                              </p>
                           </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                           <div className="flex items-center justify-end gap-2">
                              {customer.customerType === 'CREDIT' && customer.creditStatus === 'PENDING_APPROVAL' && (
                                <button 
                                  onClick={() => handleApproveCredit(customer.uid)}
                                  className="px-2 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded text-[9px] font-bold uppercase tracking-wider transition-all border border-emerald-200"
                                  title="Approve Credit Account"
                                >
                                  Approve
                                </button>
                              )}
                              <button 
                                onClick={() => {
                                  const text = `Hello ${customer.displayName || customer.name},\n\nYour PIXEL MARKETING ERP account is ready.\nEmail: ${customer.email}\nURL: ${window.location.origin}\n\nRegards,\nHindustan Enterprises`;
                                  navigator.clipboard.writeText(text);
                                  toast.success("Payload copied");
                                }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                                title="Copy Payload"
                              >
                                 <Mail size={14} />
                              </button>
                               <button 
                                onClick={() => setEditingCustomer(customer)}
                                className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-all"
                                title="Edit"
                              >
                                 <Edit3 size={14} />
                              </button>
                              <button 
                                onClick={() => setAdjustingCredit(customer)}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                                title="Ledger"
                              >
                                 <CreditCard size={14} />
                              </button>
                              <button 
                                onClick={() => toggleStatus(customer.uid, customer.status)}
                                className={`p-1.5 rounded transition-all ${
                                  customer.status === 'ACTIVE' 
                                  ? 'text-rose-400 hover:bg-rose-50 hover:text-rose-600' 
                                  : 'text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600'
                                }`}
                                title={customer.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                              >
                                 <Lock size={14} />
                              </button>
                           </div>
                        </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-12 text-center">
                   <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No matching identities found</p>
                </div>
              )}
           </div>
         )}
      </div>
      
      {/* Provisioning Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowAddModal(false)} />
           <div className="relative bg-white w-full max-w-3xl rounded shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
              <div className="flex flex-col h-full">
                 {/* Header */}
                 <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                       <div className="p-1.5 bg-indigo-600 rounded text-white shadow-sm">
                          <Plus size={16} />
                       </div>
                       <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Provision New Identity</h2>
                    </div>
                    <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                       <X className="w-5 h-5" />
                    </button>
                 </div>

                 {/* Form */}
                 <div className="p-6 overflow-y-auto">
                    <form onSubmit={handleCreateCustomer} className="space-y-6">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Entity Name</label>
                             <input 
                               required
                               type="text" 
                               placeholder="Full Name"
                               className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
                               value={formData.name}
                               onChange={e => setFormData({...formData, name: e.target.value})}
                             />
                          </div>
                          <div className="space-y-1.5">
                             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Organization / Brand</label>
                             <input 
                               type="text" 
                               placeholder="Business Name"
                               className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
                               value={formData.businessName}
                               onChange={e => setFormData({...formData, businessName: e.target.value})}
                             />
                          </div>
                          <div className="space-y-1.5">
                             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Secure Email</label>
                             <input 
                               required
                               type="email" 
                               placeholder="email@example.com"
                               className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
                               value={formData.email}
                               onChange={e => setFormData({...formData, email: e.target.value})}
                             />
                          </div>
                          <div className="space-y-1.5">
                             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Mobile Access</label>
                             <input 
                               type="tel" 
                               placeholder="+91"
                               className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
                               value={formData.phone}
                               onChange={e => setFormData({...formData, phone: e.target.value})}
                             />
                          </div>
                          <div className="space-y-1.5">
                             <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Account Type</label>
                             <select 
                               className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm appearance-none"
                               value={formData.customerType}
                               onChange={e => setFormData({...formData, customerType: e.target.value as any})}
                             >
                                <option value="CASH">CASH (Direct Payment)</option>
                                <option value="CREDIT">CREDIT (Deferred Payment)</option>
                             </select>
                          </div>
                          {formData.customerType === 'CREDIT' && (
                             <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Credit Allocation (₹)</label>
                                <input 
                                  type="number" 
                                  placeholder="e.g. 50000"
                                  className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 transition-all shadow-sm"
                                  value={formData.creditLimit}
                                  onChange={e => setFormData({...formData, creditLimit: Number(e.target.value)})}
                                />
                             </div>
                          )}
                       </div>

                       <div className="bg-slate-50 p-4 rounded border border-slate-200 space-y-3">
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                             <Lock size={12} />
                             Security Credentials
                          </div>
                          <div className="flex gap-2">
                             <div className="flex-1 relative">
                                <input 
                                  readOnly
                                  type={showPassword ? "text" : "password"}
                                  className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-mono font-bold text-slate-900 outline-none shadow-sm"
                                  value={formData.tempPassword}
                                />
                                <button 
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                   {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                             </div>
                             <div className="bg-amber-50 text-amber-700 text-[10px] font-medium px-3 py-2 rounded border border-amber-200 flex-1">
                                System-generated temporary key. Please share securely with the user.
                             </div>
                          </div>
                       </div>

                       <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                          <button 
                            type="button" 
                            onClick={() => setShowAddModal(false)}
                            className="text-[11px] font-bold uppercase text-slate-400 hover:text-slate-600 transition-colors"
                          >
                             Cancel
                          </button>
                          <button 
                            disabled={isSubmitting}
                            type="submit"
                            className="bg-indigo-600 text-white px-6 h-11 rounded font-bold uppercase text-[11px] tracking-wider shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-2"
                          >
                             {isSubmitting ? (
                               <>
                                 <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                 Processing...
                               </>
                             ) : (
                               <>
                                 <CheckCircle size={14} />
                                 Commit Account
                               </>
                             )}
                          </button>
                       </div>
                    </form>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setEditingCustomer(null)} />
            <div className="relative bg-white w-full max-w-lg rounded shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
               <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                     <div className="p-1.5 bg-slate-900 rounded text-white shadow-sm">
                        <Edit3 size={16} />
                     </div>
                     <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Update Profile Registry</h2>
                  </div>
                  <button onClick={() => setEditingCustomer(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="p-6">
                  <form onSubmit={handleUpdateCustomer} className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Contact Name</label>
                           <input 
                              type="text" 
                              className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500"
                              value={editingCustomer.name || ''}
                              onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}
                           />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Mobile Access</label>
                           <input 
                              type="tel" 
                              className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500"
                              value={editingCustomer.phone || ''}
                              onChange={e => setEditingCustomer({...editingCustomer, phone: e.target.value})}
                           />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Business Identity</label>
                           <input 
                              type="text" 
                              className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500"
                              value={editingCustomer.businessName || ''}
                              onChange={e => setEditingCustomer({...editingCustomer, businessName: e.target.value})}
                           />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Account Type</label>
                           <select 
                              className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                              value={editingCustomer.customerType}
                              onChange={e => setEditingCustomer({...editingCustomer, customerType: e.target.value as 'CASH'|'CREDIT'})}
                           >
                              <option value="CASH">CASH</option>
                              <option value="CREDIT">CREDIT</option>
                           </select>
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Credit Limit (₹)</label>
                           <input 
                              type="number" 
                              className="w-full bg-white border border-slate-200 rounded px-3 h-11 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                              value={editingCustomer.creditLimit || 0}
                              onChange={e => setEditingCustomer({...editingCustomer, creditLimit: Number(e.target.value)})}
                           />
                        </div>
                     </div>
                     <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                        <button type="button" onClick={() => setEditingCustomer(null)} className="text-[11px] font-bold uppercase text-slate-400 hover:text-slate-600">Dismiss</button>
                        <button disabled={isSubmitting} type="submit" className="bg-slate-900 text-white px-6 h-11 rounded text-[11px] font-bold uppercase tracking-wider hover:bg-black transition-all">
                           {isSubmitting ? 'Processing...' : 'Sync Registry'}
                        </button>
                     </div>
                  </form>
               </div>
            </div>
         </div>
      )}

      {/* Credit Adjustment Modal */}
      {adjustingCredit && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setAdjustingCredit(null)} />
            <div className="relative bg-white w-full max-w-md rounded shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
               <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                     <div className="p-1.5 bg-emerald-600 rounded text-white shadow-sm">
                        <CreditCard size={16} />
                     </div>
                     <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Ledger Adjustment</h2>
                  </div>
                  <button onClick={() => setAdjustingCredit(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="p-6">
                  <form onSubmit={handleAdjustCredit} className="space-y-6">
                     <div className="space-y-4">
                        <div className="flex gap-2 p-1 bg-slate-100 rounded border border-slate-200">
                           <button 
                             type="button"
                             onClick={() => setAdjustmentType('CREDIT')}
                             className={`flex-1 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${adjustmentType === 'CREDIT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                           >
                             Payment (In)
                           </button>
                           <button 
                             type="button"
                             onClick={() => setAdjustmentType('DEBIT')}
                             className={`flex-1 py-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${adjustmentType === 'DEBIT' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}
                           >
                             Deduct (Out)
                           </button>
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Amount (₹)</label>
                           <input 
                              required
                              type="number" 
                              className="w-full bg-white border border-slate-200 rounded px-4 py-3 text-xl font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-sm"
                              value={adjustmentAmount}
                              onChange={e => setAdjustmentAmount(Number(e.target.value))}
                           />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Internal Reference / Remarks</label>
                           <textarea 
                              required
                              className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs font-medium text-slate-900 h-20 outline-none focus:border-indigo-500 shadow-sm"
                              placeholder="Describe transaction context..."
                              value={adjustmentRemarks}
                              onChange={e => setAdjustmentRemarks(e.target.value)}
                           />
                        </div>
                     </div>
                     <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                        <button type="button" onClick={() => setAdjustingCredit(null)} className="text-[11px] font-bold uppercase text-slate-400 hover:text-slate-600">Cancel</button>
                        <button disabled={isSubmitting} type="submit" className={`px-6 py-2 rounded text-[11px] font-bold uppercase tracking-wider shadow-lg transition-all ${adjustmentType === 'CREDIT' ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-rose-600 text-white shadow-rose-100'}`}>
                           {isSubmitting ? 'Syncing...' : 'Commit Transaction'}
                        </button>
                     </div>
                  </form>
               </div>
            </div>
         </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" />
          <div className="bg-white w-full max-w-md rounded shadow-2xl overflow-hidden relative animate-in zoom-in-95 border border-slate-200">
            <div className="h-1 bg-emerald-500 w-full" />
            <div className="p-8 text-center">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight mb-1 uppercase">Identity Established</h3>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-6">Credential Manifest Generated</p>
              
              <div className="bg-slate-50 p-4 rounded border border-slate-200 space-y-3 text-left mb-6">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Primary Identifier</p>
                  <p className="text-xs font-bold text-slate-800">{showSuccessModal.email}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Temporary Access Key</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-indigo-600 font-mono tracking-wider">{showSuccessModal.tempPassword}</p>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`Email: ${showSuccessModal.email}\nPassword: ${showSuccessModal.tempPassword}`);
                        toast.success("Payload copied");
                      }}
                      className="p-1 text-slate-400 hover:text-indigo-600 transition-all"
                    >
                      <Plus size={14} className="rotate-45" /> {/* Copy icon shortcut */}
                      <span className="sr-only">Copy</span>
                    </button>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => setShowSuccessModal(null)}
                className="w-full py-3 bg-slate-900 text-white text-[11px] font-bold uppercase tracking-widest rounded hover:bg-black transition-all shadow-lg"
              >
                Acknowledge &amp; Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
