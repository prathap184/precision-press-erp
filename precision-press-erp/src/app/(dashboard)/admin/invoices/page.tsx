'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Users, ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';

interface CustomerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  company_name: string | null;
}

export default function AdminInvoicesCustomerList() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchCustomers() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, phone, company_name')
          .eq('role', 'CUSTOMER')
          .order('first_name', { ascending: true });
        
        if (data && !error) {
          setCustomers(data);
        }
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
    const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    const comp = (c.company_name || '').toLowerCase();
    const email = (c.email || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    return name.includes(s) || comp.includes(s) || email.includes(s) || phone.includes(s);
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground text-sm">
            Select a customer to view their invoice history.
          </p>
        </div>
        <Link 
          href="/admin/invoices/all" 
          className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded-md transition-colors flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          View All Invoices
        </Link>
      </div>

      <div className="bg-white p-6 rounded-md shadow-sm border space-y-4">
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input 
            className="w-full pl-9 pr-4 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Search customers by name, company, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-md bg-gray-50 flex flex-col items-center">
            <Users className="w-12 h-12 text-gray-300 mb-3" />
            <p>No customers found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(customer => (
              <Link 
                key={customer.id} 
                href={`/admin/invoices/customers/${customer.id}`}
                className="block group border rounded-lg p-5 hover:border-blue-300 hover:shadow-md transition-all bg-white"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                      {customer.first_name} {customer.last_name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {customer.company_name || 'No Company Name'}
                    </p>
                  </div>
                  <div className="bg-gray-100 p-2 rounded-full group-hover:bg-blue-100 transition-colors">
                    <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-blue-600" />
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t text-sm text-gray-600 space-y-1">
                  <p>{customer.email}</p>
                  <p>{customer.phone || 'No phone number'}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
