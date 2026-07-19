'use client';
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { AuthService } from '@/services/auth';
import { 
  ALL_STAFF_ROLES, 
  ROLE_META, 
  ALL_PRINTER_CATEGORIES, 
  PRINTER_CATEGORY_META,
  StaffRole
} from '@/types/roles';
import { ArrowLeft, UserPlus, Mail, Lock, User, Shield, Printer } from 'lucide-react';
import Link from 'next/link';

export default function CreateStaffPage() {
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('MANAGER');
  const [printerCategory, setPrinterCategory] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await AuthService.register({
        email,
        password,
        name,
        role,
        printerCategory: role === 'PRINTER' ? printerCategory : undefined,
      });
      
      // Successfully created staff, go back to staff list
      router.push('/admin/staff');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create staff member.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/admin/staff" className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-[28px] font-bold font-black text-slate-900 uppercase tracking-tight">Create Staff</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Add a new staff member to the ERP
            </p>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
              <UserPlus size={16} className="text-blue-500" />
              Staff Details
            </h2>
          </div>
          
          <form onSubmit={handleCreate} className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-semibold flex items-start gap-3">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {/* Full Name */}
              <div className="space-y-2 col-span-2 md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Full Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div className="space-y-2 col-span-2 md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2 col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Initial Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
                  />
                </div>
                <p className="text-[11px] font-medium text-slate-400">The staff member can change this later.</p>
              </div>

              {/* Role Selection */}
              <div className="space-y-2 col-span-2 border-t border-slate-100 pt-6 mt-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Shield size={12} /> Assign Primary Role
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {ALL_STAFF_ROLES.map((r) => {
                    const meta = ROLE_META[r];
                    if (!meta) return null;
                    const isSelected = role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500' 
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                        }`}
                      >
                        <span 
                          className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mb-1.5"
                          style={{ color: meta.color, background: meta.bg }}
                        >
                          {meta.label}
                        </span>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-slate-900' : 'text-slate-500'}`}>
                          {r.toLowerCase().replace('_', ' ')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Printer Category (If Role is Printer) */}
              {role === 'PRINTER' && (
                <div className="space-y-2 col-span-2 border-t border-slate-100 pt-6 mt-2 animate-in fade-in zoom-in-95">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Printer size={12} /> Printer Machine Category
                  </label>
                  <p className="text-[11px] font-medium text-slate-400 mb-3">Which orders can this printer access?</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {ALL_PRINTER_CATEGORIES.map((cat) => {
                      const meta = PRINTER_CATEGORY_META[cat];
                      if (!meta) return null;
                      const isSelected = printerCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setPrinterCategory(cat)}
                          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                            isSelected 
                              ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-1 ring-indigo-500' 
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                          }`}
                        >
                          <span 
                            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider mb-1.5"
                            style={{ color: meta.color, background: meta.bg }}
                          >
                            {meta.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end gap-3">
              <Link 
                href="/admin/staff"
                className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading || (role === 'PRINTER' && !printerCategory)}
                className="px-8 py-2.5 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>Create Staff Account</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </RoleGuard>
  );
}
