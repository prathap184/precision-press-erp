"use client";

import { Receipt, CreditCard, ClipboardList, ClipboardCheck, PackageOpen, Undo2, PackageCheck, Repeat } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/accounting/purchases", label: "Bills", icon: Receipt, exact: true },
  { href: "/accounting/purchases/bills/recurring", label: "Recurring Bills", icon: Repeat, title: "Supplier bills that repeat on a schedule" },
  { href: "/accounting/purchases/debit-notes", label: "Supplier Credits", icon: Undo2, title: "Credit a supplier owes you back, applied against bills" },
  { href: "/accounting/purchases/expenses", label: "Expenses", icon: CreditCard },
  { href: "/accounting/purchases/orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/accounting/purchases/goods-receipts", label: "Goods Received", icon: PackageCheck, title: "Items received from suppliers against a purchase order" },
  { href: "/accounting/purchases/requisitions", label: "Requisitions", icon: ClipboardCheck },
  { href: "/accounting/purchases/landed-costs", label: "Landed Costs", icon: PackageOpen, title: "Extra costs like freight & duty added to the cost of stock" },
];

export default function PurchasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
