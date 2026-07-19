'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Users, ChevronRight, FilePlus2, Building2, Phone, Mail } from 'lucide-react';
import Link from 'next/link';
import { RoleGuard } from '@/lib/role-guard';

interface CustomerProfile {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  businessName: string | null;
}

export default function InvoiceGenerationCustomerList() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchCustomers() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, email, phone, businessName')
          .eq('role', 'CUSTOMER')
          .order('name', { ascending: true });
        if (data && !error) setCustomers(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchCustomers();
  }, []);

  const filtered = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    const customerName = (c.name || '').toLowerCase();
    return (
      customerName.includes(s) ||
      (c.businessName || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.phone || '').toLowerCase().includes(s)
    );
  });

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']}>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">

        {/* Page Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <FilePlus2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.4em]">Invoice Generation</p>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Select Customer</h1>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <span className="text-violet-600">Customers</span>
          <ChevronRight size={12} />
          <span>Orders</span>
          <ChevronRight size={12} />
          <span>Generate Invoice</span>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all bg-slate-50"
              placeholder="Search by name, company, email, or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Customer Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/2 mb-4" />
                <div className="h-3 bg-slate-100 rounded w-full mb-2" />
                <div className="h-3 bg-slate-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
              <Users className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-400 font-bold text-sm">
              {search ? 'No customers match your search.' : 'No customers found.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(customer => {
              const fullName = customer.name?.trim() || 'Unknown';
              const nameParts = fullName.split(' ').filter(Boolean);
              const initials = nameParts.length > 1 
                ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                : (fullName[0] || '?').toUpperCase();
              return (
                <Link
                  key={customer.id}
                  href={`/admin/invoice-generation/${customer.id}`}
                  className="group block bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-violet-300 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center flex-shrink-0 group-hover:from-violet-200 group-hover:to-indigo-200 transition-all">
                        <span className="text-sm font-black text-violet-700">{initials}</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 group-hover:text-violet-700 transition-colors">
                          {fullName}
                        </h3>
                        {customer.businessName && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Building2 size={10} className="text-slate-400" />
                            <p className="text-[11px] text-slate-500 font-medium">{customer.businessName}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-violet-100 flex items-center justify-center transition-colors">
                      <ChevronRight size={14} className="text-slate-400 group-hover:text-violet-600 transition-colors" />
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Mail size={11} className="text-slate-400 flex-shrink-0" />
                      <p className="text-[11px] text-slate-500 font-medium truncate">{customer.email}</p>
                    </div>
                    {customer.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={11} className="text-slate-400 flex-shrink-0" />
                        <p className="text-[11px] text-slate-500 font-medium">{customer.phone}</p>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-center text-xs text-slate-400 font-medium">
            Showing {filtered.length} of {customers.length} customers
          </p>
        )}
      </div>
    </RoleGuard>
  );
}
