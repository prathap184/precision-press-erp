"use client";

import { FileText, ScrollText, CreditCard, RefreshCw, Banknote, Wallet, CalendarClock, Coins } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/accounting/sales", label: "Invoices", icon: FileText, exact: true },
  { href: "/accounting/sales/quotes", label: "Quotes", icon: ScrollText },
  { href: "/accounting/sales/receipts", label: "Cash Sales", icon: Banknote },
  { href: "/accounting/sales/credit-notes", label: "Credit Notes", icon: CreditCard },
  { href: "/accounting/sales/payments", label: "Payments", icon: Coins, title: "Payments received from customers" },
  { href: "/accounting/sales/customer-prepayments", label: "Receipts", icon: Wallet, title: "Advance receipts & customer payment records" },
  { href: "/accounting/sales/revenue-schedules", label: "Revenue Schedules", icon: CalendarClock, title: "Recognise income from an invoice gradually over time" },
  { href: "/accounting/sales/recurring", label: "Recurring", icon: RefreshCw },
];

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
