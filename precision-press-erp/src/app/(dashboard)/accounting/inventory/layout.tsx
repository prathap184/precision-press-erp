"use client";

import { Package, ClipboardList, Warehouse, BarChart3, ArrowLeftRight } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/accounting/inventory", label: "Items", icon: Package, exact: true },
  { href: "/accounting/inventory/stock-takes", label: "Stocktakes", icon: ClipboardList },
  { href: "/accounting/inventory/warehouses", label: "Locations", icon: Warehouse },
  { href: "/accounting/inventory/transfers", label: "Transfers", icon: ArrowLeftRight },
  { href: "/accounting/inventory/valuation", label: "Stock value", icon: BarChart3 },
];

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
