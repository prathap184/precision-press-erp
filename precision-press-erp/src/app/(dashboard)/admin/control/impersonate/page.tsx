'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useCallback } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import { useImpersonation } from '@/lib/impersonation-context';
import { UserProfile } from '@/types/auth';
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
  Phone,
  Mail,
  CreditCard,
  X,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Eye,
} from 'lucide-react';

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function CustomerSearchPanel() {
  const { searchCustomers, startImpersonation, isLoading, error, viewMode, simulatedUser } = useImpersonation();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    const found = await searchCustomers(searchTerm.trim());
    setResults(found);
    setSearching(false);
  }, [searchTerm, searchCustomers]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or phone number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching || !searchTerm.trim()}
          className="px-4 h-11 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Search
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded text-red-700 text-sm font-medium">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            {results.length} Customer{results.length !== 1 ? 's' : ''} Found
          </p>
          {results.map((customer) => (
            <CustomerResultCard
              key={customer.uid}
              customer={customer}
              onSelect={startImpersonation}
              isLoading={isLoading}
            />
          ))}
        </div>
      )}

      {results.length === 0 && searchTerm && !searching && (
        <div className="text-center py-6 text-slate-500 text-sm border border-dashed border-slate-200 rounded">
          No customers found for <strong>"{searchTerm}"</strong>
        </div>
      )}
    </div>
  );
}

function CustomerResultCard({
  customer,
  onSelect,
  isLoading,
}: {
  customer: UserProfile;
  onSelect: (id: string) => Promise<void>;
  isLoading: boolean;
}) {
  const fmt = (n: number) =>
    `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
  const usedPct =
    customer.creditLimit > 0
      ? Math.min(100, ((customer.usedCredit || 0) / customer.creditLimit) * 100)
      : 0;

  return (
    <div className="p-3 bg-white border border-slate-200 rounded hover:border-indigo-300 hover:shadow-sm transition-all group flex items-center gap-4">
      {/* Avatar */}
      <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center shrink-0 border border-slate-200">
        <User size={16} className="text-slate-500" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="font-bold text-slate-800 text-sm truncate">
            {customer.name || customer.displayName}
          </h4>
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
            customer.customerType === 'CREDIT'
              ? 'bg-blue-50 text-blue-700 border border-blue-100'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
          }`}>
            {customer.customerType || 'CASH'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
          {customer.phone && (
            <span className="flex items-center gap-1">
              <Phone size={10} /> {customer.phone}
            </span>
          )}
          {customer.email && (
            <span className="flex items-center gap-1">
              <Mail size={10} /> {customer.email}
            </span>
          )}
        </div>
        {/* Credit Bar */}
        {customer.customerType === 'CREDIT' && customer.creditLimit > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-500 font-semibold whitespace-nowrap">
              {fmt(customer.usedCredit || 0)} / {fmt(customer.creditLimit)}
            </span>
          </div>
        )}
      </div>

      {/* Action */}
      <button
        onClick={() => onSelect(customer.uid)}
        disabled={isLoading}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-200 text-xs font-semibold hover:bg-indigo-600 hover:text-white disabled:opacity-50 transition-all"
      >
        {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
        View As
      </button>
    </div>
  );
}

// ─── Active Session Banner ─────────────────────────────────────────────────────

function ImpersonationBanner() {
  const { viewMode, simulatedUser, stopImpersonation } = useImpersonation();

  if (viewMode !== 'CUSTOMER' || !simulatedUser) return null;

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-white px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <ShieldAlert size={18} className="shrink-0" />
        <span className="text-sm font-black">
          Admin Simulation Active — Viewing as{' '}
          <span className="underline">{simulatedUser.name || simulatedUser.displayName}</span>
          <span className="opacity-70 font-medium ml-2">({simulatedUser.phone})</span>
        </span>
      </div>
      <button
        onClick={stopImpersonation}
        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all"
      >
        <X size={14} />
        Exit Simulation
      </button>
    </div>
  );
}

// ─── Lazy Customer Dashboard View ──────────────────────────────────────────────

function SimulatedCustomerView() {
  const { simulatedUser } = useImpersonation();
  if (!simulatedUser) return null;

  // Dynamically render customer sub-pages within the admin context.
  // We import the customer dashboard and pass the simulated userId as a prop override.
  // The dashboard reads orders/ledger etc. but now for the simulated user.
  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Customer Type" value={simulatedUser.customerType || 'CASH'} accent="blue" />
        <StatCard
          label="Credit Used"
          value={`₹${(simulatedUser.usedCredit || 0).toLocaleString('en-IN')}`}
          accent="amber"
        />
        <StatCard
          label="Credit Limit"
          value={`₹${(simulatedUser.creditLimit || 0).toLocaleString('en-IN')}`}
          accent="green"
        />
      </div>

      {/* Simulation context notice removed for cleaner administrative view */}

      <div className="bg-white border border-slate-200 rounded p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-800 mb-3">
          Quick Links — Acting as {simulatedUser.name}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'Customer Orders', href: `/customer/orders` },
            { label: 'Account Ledger', href: `/customer/ledger` },
            { label: 'Report Payment', href: `/customer/payment` },
            { label: 'Wishlist', href: `/customer/wishlist` },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs font-semibold text-slate-700 transition-all group"
            >
              {link.label}
              <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </a>
          ))}
        </div>
        <p className="text-[10px] text-emerald-600 font-semibold mt-3">
          ✓ Phase 2b active — all pages now read data for {simulatedUser.name} via effectiveUserId.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'blue' | 'green' | 'amber';
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
  };
  return (
    <div className={`p-4 rounded border ${colors[accent]} shadow-sm`}>
      <p className="text-xs font-semibold uppercase opacity-80 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function ImpersonatePageContent() {
  const { user } = useAuth();
  const { viewMode, simulatedUser, stopImpersonation } = useImpersonation();

  return (
    <div className="space-y-6 pb-10">
      {/* Active simulation banner */}
      <ImpersonationBanner />

      {/* Header */}
      <section className="bg-white border border-slate-200 rounded p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert size={16} className="text-amber-600" />
            <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">
              Customer Impersonation
            </p>
          </div>
          <h1 className="text-[28px] font-bold font-bold text-slate-800 uppercase">
            View As Customer
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Select any customer to simulate their account. You remain logged in as Admin — your real
            identity is never changed. All actions are audit logged.
          </p>
        </div>

        <div className="flex flex-col gap-2 text-right">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${
            viewMode === 'CUSTOMER'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {viewMode === 'CUSTOMER' ? (
              <><ShieldAlert size={14} /> Simulating Customer</>
            ) : (
              <><ShieldCheck size={14} /> Admin Identity Active</>
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            Real UID: {user?.uid?.slice(0, 12)}...
          </p>
        </div>
      </section>

      {/* Search or Active View */}
      {viewMode === 'ADMIN' ? (
        <div className="bg-white border border-slate-200 rounded p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-4">
            Select Customer
          </h2>
          <CustomerSearchPanel />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active customer header */}
          <div className="bg-white border border-amber-200 rounded p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800">
                Active: {simulatedUser?.name || simulatedUser?.displayName}
              </h2>
              <button
                onClick={stopImpersonation}
                className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-slate-900 flex items-center gap-1 transition-colors"
              >
                <X size={12} /> Change Customer
              </button>
            </div>
            <SimulatedCustomerView />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <ImpersonatePageContent />
    </RoleGuard>
  );
}
