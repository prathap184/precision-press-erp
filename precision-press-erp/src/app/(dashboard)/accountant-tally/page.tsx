import React from 'react';
import Link from 'next/link';
import { 
  FileText, 
  Receipt, 
  IndianRupee, 
  CreditCard, 
  BookOpen, 
  Building, 
  FileSpreadsheet 
} from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accountant Tally Dashboard',
};

const links = [
  {
    title: 'Sales Register',
    href: '/sales-register',
    icon: <FileText className="w-8 h-8 text-blue-600 mb-4" />,
    desc: 'View all sales invoices'
  },
  {
    title: 'Receipt Register',
    href: '/receipt-register',
    icon: <Receipt className="w-8 h-8 text-green-600 mb-4" />,
    desc: 'View all recorded receipts'
  },
  {
    title: 'Receipt Entry (Payment In)',
    href: '/receipt-entry',
    icon: <IndianRupee className="w-8 h-8 text-emerald-600 mb-4" />,
    desc: 'Record customer payments'
  },
  {
    title: 'Payment Entry (Payment Out)',
    href: '/payment-entry',
    icon: <CreditCard className="w-8 h-8 text-orange-600 mb-4" />,
    desc: 'Record payments to suppliers'
  },
  {
    title: 'Journal Entries',
    href: '/admin/journal-transfers',
    icon: <BookOpen className="w-8 h-8 text-purple-600 mb-4" />,
    desc: 'Transfer balances between ledgers'
  },
  {
    title: 'Contra Entries (Treasury)',
    href: '/admin/treasury',
    icon: <Building className="w-8 h-8 text-slate-600 mb-4" />,
    desc: 'Cash to Bank / Bank to Cash transfers'
  },
  {
    title: 'Quotations',
    href: '/quotation-register',
    icon: <FileSpreadsheet className="w-8 h-8 text-indigo-600 mb-4" />,
    desc: 'View generated quotations'
  }
];

export default function AccountantTallyDashboard() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Accountant Tally</h1>
        <p className="text-slate-500 mt-2 text-lg">Central hub for all accounting registers and vouchers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {links.map((link) => (
          <Link href={link.href} key={link.title}>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer h-full flex flex-col items-start">
              {link.icon}
              <h3 className="text-lg font-bold text-slate-800">{link.title}</h3>
              <p className="text-slate-500 text-sm mt-1">{link.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
