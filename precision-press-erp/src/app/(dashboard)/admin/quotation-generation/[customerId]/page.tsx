'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, ChevronRight, FilePlus2, Package, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';

interface CustomerProfile {
  id: string;
  name: string | null;
  email: string;
  businessName: string | null;
}

interface ParentOrderRow {
  id: string;
  customerId: string;
  customerName: string;
  status: string;
  amounts: any;
  createdAt: string;
  totalChildOrders: number;
  quotationdChildOrders: number;
}

export default function QuotationGenerationOrderList({ params }: { params: { customerId: string } }) {
  const { customerId } = params;
  const router = useRouter();

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<ParentOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Fetch customer profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, name, email, businessName')
          .eq('id', customerId)
          .single();
        if (profile) setCustomer(profile);

        // Fetch parent orders (those without -item in their ID) for this customer
        const { data: parentOrders, error: ordErr } = await supabase
          .from('orders')
          .select('id, "customerId", "customerName", status, amounts, "createdAt"')
          .eq('"customerId"', customerId)
          .not('id', 'like', '%-item%')
          .order('"createdAt"', { ascending: false });

        if (ordErr) throw ordErr;
        const pOrders = parentOrders || [];

        // For each parent order, fetch child order count and quotationd count
        const enriched: ParentOrderRow[] = await Promise.all(
          pOrders.map(async (po: any) => {
            const { data: children, error: childErr } = await supabase
              .from('orders')
              .select('id, quotation_generated')
              .like('id', `${po.id}-item%`);

            const childList = !childErr && children ? children : [];
            const totalChildOrders   = childList.length;
            const quotationdChildOrders = childList.filter((c: any) => c.quotation_generated).length;

            return {
              id:                   po.id,
              customerId:           po.customerId,
              customerName:         po.customerName,
              status:               po.status,
              amounts:              po.amounts,
              createdAt:            po.createdAt,
              totalChildOrders,
              quotationdChildOrders,
            };
          })
        );

        setOrders(enriched);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [customerId]);

  const customerName = customer?.name?.trim() || customer?.email || 'Customer';

  const getQuotationProgressColor = (quotationd: number, total: number) => {
    if (total === 0) return 'text-slate-400';
    if (quotationd === 0) return 'text-amber-600';
    if (quotationd === total) return 'text-green-600';
    return 'text-blue-600';
  };

  const getQuotationProgressBg = (quotationd: number, total: number) => {
    if (total === 0) return 'bg-slate-100';
    if (quotationd === 0) return 'bg-amber-50';
    if (quotationd === total) return 'bg-green-50';
    return 'bg-blue-50';
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT']}>
      <div className="max-w-5xl mx-auto space-y-6 pb-12">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/quotation-generation')}
            className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={18} className="text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <FilePlus2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.4em]">Quotation Generation</p>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{customerName}</h1>
              {customer?.businessName && (
                <p className="text-xs text-slate-400 font-medium mt-0.5">{customer.businessName}</p>
              )}
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <Link href="/admin/quotation-generation" className="text-violet-600 hover:underline">Customers</Link>
          <ChevronRight size={12} />
          <span className="text-violet-600">{customerName}</span>
          <ChevronRight size={12} />
          <span>Generate Quotation</span>
        </div>

        {/* Orders */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-40" />
                    <div className="h-3 bg-slate-100 rounded w-24" />
                  </div>
                  <div className="h-8 bg-slate-100 rounded-full w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
              <Package className="w-8 h-8 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-slate-700 font-black text-sm">No orders found for this customer.</p>
              <p className="text-slate-400 font-medium text-xs mt-1">
                When the customer places an order, it will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => {
              const progressColor = getQuotationProgressColor(order.quotationdChildOrders, order.totalChildOrders);
              const progressBg    = getQuotationProgressBg(order.quotationdChildOrders, order.totalChildOrders);
              const fullyQuotationd = order.totalChildOrders > 0 && order.quotationdChildOrders === order.totalChildOrders;
              const orderDate     = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
              const grandTotal    = order.amounts?.grandTotal ?? 0;

              return (
                <Link
                  key={order.id}
                  href={`/admin/quotation-generation/${customerId}/${order.id}`}
                  className="group block bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-violet-300 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${fullyQuotationd ? 'bg-green-100' : 'bg-indigo-50'}`}>
                        {fullyQuotationd
                          ? <CheckCircle size={20} className="text-green-600" />
                          : <Package size={20} className="text-indigo-600" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 group-hover:text-violet-700 transition-colors font-mono">
                          {order.id}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                            <Clock size={10} />
                            {orderDate}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            order.status === 'DISPATCHED' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'DELIVERED'  ? 'bg-green-100 text-green-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Quotation progress badge */}
                      <div className={`px-3 py-2 rounded-xl text-center ${progressBg}`}>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Items Quotationd</p>
                        <p className={`text-sm font-black ${progressColor}`}>
                          {order.totalChildOrders > 0
                            ? `${order.quotationdChildOrders} / ${order.totalChildOrders}`
                            : '—'
                          }
                        </p>
                      </div>

                      {/* Amount */}
                      <div className="text-right hidden sm:block">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</p>
                        <p className="text-sm font-black text-slate-900">₹{grandTotal.toLocaleString('en-IN')}</p>
                      </div>

                      <ChevronRight size={18} className="text-slate-300 group-hover:text-violet-500 transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && orders.length > 0 && (
          <p className="text-center text-xs text-slate-400 font-medium">{orders.length} order(s) found</p>
        )}
      </div>
    </RoleGuard>
  );
}
