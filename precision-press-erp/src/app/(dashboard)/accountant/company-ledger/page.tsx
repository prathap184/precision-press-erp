export const dynamic = 'force-dynamic';

import { supabaseServer } from '@/lib/supabase-server';
import Link from 'next/link';
import {
  Wallet,
  Building2,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  FileText,
  Users,
  CreditCard,
  Receipt,
  PieChart,
  Truck
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon size={22} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className={`text-2xl font-black leading-none ${color}`}>{value.includes('?') ? value.replace('?', '₹') : value}</p>
        {sub && <p className="text-xs text-slate-400 font-medium mt-1">{sub.replace('?', '₹')}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CompanyLedgerPage() {
  // 1. Fetch total receipts (count and amount)
  const { data: receipts } = await supabaseServer
    .from('receipt_entries')
    .select('credit');

  const totalReceiptsCount = receipts?.length || 0;
  const totalReceiptsAmount = (receipts || []).reduce((sum, r) => sum + (Number(r.credit) || 0), 0);

  // 2. Fetch total payments and expenses
  const { data: payments } = await supabaseServer
    .from('payment_entries')
    .select('amount, payment_category, supplier_id');

  const totalPaymentsCount = payments?.length || 0;
  const totalPaymentsAmount = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const expenses = (payments || []).filter(p => p.payment_category === 'Expense');
  const totalExpensesCount = expenses.length;
  const totalExpensesAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const supplierPayments = (payments || []).filter(p => p.supplier_id != null || p.payment_category !== 'Expense');
  const totalSupplierPaymentsAmount = supplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // 3. Fetch total sale invoices
  const { data: invoices } = await supabaseServer
    .from('invoices')
    .select('grand_total');

  const totalInvoicesCount = invoices?.length || 0;
  const totalInvoicesAmount = (invoices || []).reduce((sum, inv) => sum + (Number(inv.grand_total) || 0), 0);

  // 4. Fetch total suppliers and customers count
  const { count: totalSuppliersCount } = await supabaseServer
    .from('suppliers')
    .select('id', { count: 'exact', head: true });

  const { count: totalCustomersCount } = await supabaseServer
    .from('customers')
    .select('id', { count: 'exact', head: true });

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12 font-sans selection:bg-blue-100 selection:text-blue-900">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <Building2 size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 leading-tight">Company Ledger</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Financial Overview</p>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 mt-8 space-y-6">

        {/* ─── Section: Summary Metrics ─── */}
        <section>
          <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 pl-1 mt-8">Summary Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <SummaryCard
              icon={Receipt}
              label="Total Receipts"
              value={fmt(totalReceiptsAmount)}
              sub={`${totalReceiptsCount} receipt entries recorded`}
              color="text-emerald-500"
              bg="bg-emerald-50"
            />
            
            <SummaryCard
              icon={CreditCard}
              label="Total Payments"
              value={fmt(totalPaymentsAmount)}
              sub={`${totalPaymentsCount} payment entries recorded`}
              color="text-red-500"
              bg="bg-red-50"
            />
            
            <SummaryCard
              icon={FileText}
              label="Sales Invoices"
              value={fmt(totalInvoicesAmount)}
              sub={`${totalInvoicesCount} sale invoices generated`}
              color="text-blue-500"
              bg="bg-blue-50"
            />

            <SummaryCard
              icon={PieChart}
              label="Total Expenses"
              value={fmt(totalExpensesAmount)}
              sub={`${totalExpensesCount} expense payments recorded`}
              color="text-orange-500"
              bg="bg-orange-50"
            />
            
            <SummaryCard
              icon={Truck}
              label="Supplier Metrics"
              value={fmt(totalSupplierPaymentsAmount)}
              sub={`${totalSuppliersCount || 0} registered suppliers`}
              color="text-indigo-500"
              bg="bg-indigo-50"
            />
            
            <SummaryCard
              icon={Users}
              label="Customer Metrics"
              value={fmt(totalReceiptsAmount)}
              sub={`${totalCustomersCount || 0} registered customers`}
              color="text-teal-500"
              bg="bg-teal-50"
            />
          </div>
        </section>

        {/* ─── Footer note ─── */}
        <p className="text-center text-[11px] text-slate-300 font-medium mt-12">
          Data sourced from Supabase • Refreshed on every page load
        </p>
      </div>
    </div>
  );
}
