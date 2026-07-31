'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Search, Download, CheckCircle, ChevronLeft } from 'lucide-react';
import Link from 'next/link';


export default function CustomerInvoicesPage({ params }: { params: { customerId: string } }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'orders' | 'history'>('orders');

  const fetchCustomerData = async () => {
    setLoading(true);
    try {
      const [profileRes, invoiceRes, orderRes] = await Promise.all([
        supabase.from('contact').select('*').eq('id', params.customerId).single(),
        supabase.from('invoices').select('*').eq('customer_id', params.customerId).order('created_at', { ascending: false }),
        supabase.from('orders').select('*').eq('customer_id', params.customerId).order('created_at', { ascending: false })
      ]);

      if (profileRes.data) setCustomer(profileRes.data);
      if (invoiceRes.data) setInvoices(invoiceRes.data);
      if (orderRes.data) setOrders(orderRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerData();
  }, [params.customerId]);

  // Orders Logic
  const parentOrders = orders.filter(o => !o.base_order_id);
  
  const filteredOrders = parentOrders.filter(o => {
    if (!search) return true;
    return (o.id || '').toLowerCase().includes(search.toLowerCase());
  });

  const getOrderStats = (parentId: string) => {
    const children = orders.filter(o => o.base_order_id === parentId);
    const invoicedCount = children.filter(o => o.invoice_generated === true).length;
    const totalCount = children.length;
    return { invoicedCount, totalCount, children };
  };

  // Invoices Logic
  const filteredInvoices = invoices.filter(inv => {
    if (!search) return true;
    const s = search.toLowerCase();
    const num = inv.invoice_number || '';
    const pid = inv.parent_order_id || '';
    return num.toLowerCase().includes(s) || pid.toLowerCase().includes(s);
  });

  const fmtDate = (v: any) => { try { return v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; } catch { return '—'; } };
  const fmtCurrency = (n: any) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const statusConfig: Record<string, { label: string; cls: string }> = {
    PENDING:             { label: 'Pending',           cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    GENERATING:          { label: 'Generating…',       cls: 'bg-sky-50 text-sky-600 border-sky-200' },
    GENERATED:           { label: 'Generated',         cls: 'bg-blue-50 text-blue-600 border-blue-200' },
    SENT:                { label: 'Sent',              cls: 'bg-purple-50 text-purple-600 border-purple-200' },
    PAID:                { label: 'Paid',              cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    CANCELLED:           { label: 'Cancelled',         cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/invoices" className="flex items-center text-sm text-blue-600 hover:text-blue-800 mb-2 font-medium">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Customers
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Invoice Generation</h1>
        <p className="text-muted-foreground text-sm">
          {customer ? `${customer.first_name || ''} ${customer.last_name || ''} ${customer.company_name ? `(${customer.company_name})` : ''}` : 'Loading...'}
        </p>
      </div>

      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'orders' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Customer Orders
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Invoice History
        </button>
      </div>

      <div className="bg-white p-6 rounded-md shadow-sm border space-y-4">
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input 
            className="w-full pl-9 pr-4 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder={activeTab === 'orders' ? "Search order ID..." : "Search invoice number, order ID..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : activeTab === 'orders' ? (
          // --- ORDERS TAB ---
          filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-md bg-gray-50 flex flex-col items-center">
              <FileText className="w-12 h-12 text-gray-300 mb-3" />
              <p>No orders found for this customer.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map(order => {
                const stats = getOrderStats(order.id);
                const isFullyInvoiced = stats.totalCount > 0 && stats.invoicedCount === stats.totalCount;

                return (
                  <Link 
                    key={order.id} 
                    href={`/admin/invoices/orders/${order.id}`}
                    className="block group border rounded-lg p-5 hover:border-blue-300 hover:shadow-md transition-all bg-white relative"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 font-mono text-sm group-hover:text-blue-700 transition-colors">
                          {order.id.slice(0, 14)}...
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          Date: {fmtDate(order.created_at)}
                        </p>
                      </div>
                      {isFullyInvoiced ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <div className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                          Items Invoiced: {stats.invoicedCount} / {stats.totalCount}
                        </div>
                      )}
                    </div>
                    
                    <div className="pt-3 border-t text-sm text-gray-600 flex justify-between items-center">
                      <span>{stats.totalCount} {stats.totalCount === 1 ? 'Item' : 'Items'}</span>
                      <span className="text-blue-600 font-medium group-hover:underline flex items-center">
                        Select Items <ChevronLeft className="w-4 h-4 ml-1 rotate-180" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : (
          // --- INVOICE HISTORY TAB ---
          filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-md bg-gray-50 flex flex-col items-center">
              <FileText className="w-12 h-12 text-gray-300 mb-3" />
              <p>No invoices found for this customer.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Invoice / Date</th>
                    <th className="px-3 py-2">Order Ref</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map(inv => {
                    const conf = statusConfig[inv.status] || { label: inv.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 align-top">
                          <Link href={`/admin/invoices/${inv.id}`} className="font-bold text-blue-600 hover:underline">
                            {inv.invoice_number || 'Pending Assignment'}
                          </Link>
                          <div className="text-slate-500 mt-0.5">{fmtDate(inv.invoice_date || inv.created_at)}</div>
                        </td>
                        <td className="px-3 py-3 align-top text-slate-600 font-mono">
                          {inv.parent_order_id ? inv.parent_order_id.slice(0, 14) + '...' : '—'}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${conf.cls}`}>
                            {conf.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top text-right font-semibold text-slate-800">
                          {inv.grand_total ? fmtCurrency(inv.grand_total) : '—'}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col gap-1 items-start">
                            <Link href={`/admin/invoices/${inv.id}`} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
                              <Search className="w-3 h-3" /> View Details
                            </Link>
                            {inv.pdf_url && (
                              <a href={inv.pdf_url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 font-medium">
                                <Download className="w-3 h-3" /> Download PDF
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
