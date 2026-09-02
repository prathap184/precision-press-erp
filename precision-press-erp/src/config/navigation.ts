import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptIndianRupee,
  Settings,
  Users,
  PackageCheck,
  Layers,
  Heart,
  Star,
  User,
  UserCheck,
  CreditCard,
  Activity,
  ClipboardList,
  Command,
  Printer,
  Headphones,
  Palette,
  Truck,
  Calculator,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Building2,
  FileText,
  Receipt,
  FileSpreadsheet,
  FilePlus2,
  Wallet,
  BookOpen,
} from 'lucide-react';
import { StaffRole } from '@/types/roles';
import { UserRole } from '@/types/auth';

export type AnyRole = StaffRole | UserRole;

export interface NavItem {
  label: string;
  href: string;
  icon: any;
  /** Any role in this array grants access. ADMIN/SUPER_ADMIN always pass. */
  roles: AnyRole[];
  group: 'main' | 'account' | 'bottom';
  subItems?: { label: string; href: string }[];
}

/**
 * Returns the correct, role-scoped Global Orders URL for any role or workspace.
 */
export function getRoleGlobalOrdersUrl(roleOrModule?: string | null, workspaceParam?: string | null): string {
  const mod = (workspaceParam || roleOrModule || '').toLowerCase().replace('/', '');
  switch (mod) {
    case 'designer': return '/designer/orders';
    case 'printer': return '/printer/orders';
    case 'pasting': return '/pasting/orders';
    case 'finishing': return '/finishing/orders';
    case 'dispatch': return '/dispatch/orders';
    case 'support': return '/support/orders';
    case 'accountant': return '/accountant/orders';
    case 'manager': return '/manager/orders';
    case 'acdema': return '/acdema/orders';
    case 'admin':
    case 'super_admin':
    default:
      return '/admin/orders';
  }
}

// ─── PHASE 8: Module Registry ─────────────────────────────────────────────────
// Each module maps to one or more roles. Sidebar filters this list live
// based on the user's current `roles` array from the real-time auth context.

export const NAVIGATION_ITEMS: NavItem[] = [
  // ── Customer ──────────────────────────────────────────────────────────────
  { label: 'Browse Products',      href: '/customer/categories',    icon: Layers,               roles: ['CUSTOMER'],                                                           group: 'main'    },
  { label: 'Multi Order',          href: '/customer/multi-order',   icon: ShoppingCart,         roles: ['CUSTOMER'],                                                           group: 'main'    },
  { label: 'My Dashboard',         href: '/customer',               icon: LayoutDashboard,      roles: ['CUSTOMER'],                                                           group: 'main'    },
  { label: 'All Orders',           href: '/customer/orders',        icon: ShoppingCart,         roles: ['CUSTOMER'],                                                           group: 'main'    },
  { label: 'Cart',                 href: '/customer/cart',          icon: ShoppingCart,         roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'Account Ledger',       href: '/customer/ledger',        icon: Activity,             roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'Report Payment',       href: '/customer/payment',       icon: CreditCard,           roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'Request Payment',      href: '/customer/request-payment', icon: ReceiptIndianRupee,  roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'Membership',           href: '/customer/membership',    icon: Star,                 roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'My Profile',           href: '/customer/profile',       icon: User,                 roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'My Documents',         href: '/customer/documents',     icon: FileText,             roles: ['CUSTOMER'],                                                           group: 'account' },

  // ── Staff / Ops Hub ──────────────────────────────────────────────────────
  { label: 'Command Center',       href: '/staff',                  icon: Command,              roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACDEMA', 'DESIGNER', 'PRINTER', 'DISPATCH', 'DELIVERY', 'ACCOUNTANT', 'SUPPORT', 'PASTING', 'FINISHING'], group: 'main' },
  // { label: 'Job Management',       href: '#job-management',         icon: ClipboardList,        roles: ['ACDEMA'],                                                             group: 'main', subItems: [
  //   { label: 'Jobs Passed By Me', href: '/acdema?view=passed' },
  //   { label: 'All Jobs', href: '/acdema?view=all' },
  //   { label: 'Jobs At My Stage', href: '/acdema?view=my-stage' },
  // ] },

  // ── Admin / Super Admin ─────────────────────────────────────────────
  { label: 'Staff Management',     href: '/admin/staff',            icon: Users,                roles: ['ADMIN', 'SUPER_ADMIN', 'ACDEMA'],                                     group: 'main' },
  { label: 'GST PAGE',             href: '#gst-page',               icon: FileSpreadsheet,      roles: ['ADMIN', 'SUPER_ADMIN', 'ACDEMA'],                                     group: 'main', subItems: [
    { label: 'HSN Master', href: '/admin/hsn-master' },
    { label: 'GST & Invoice Settings', href: '/admin/settings/gst-invoice' },
  ] },
  // Admin: full /admin/orders global hub
  { label: '(G) Global Orders',    href: '/admin/orders',           icon: ClipboardList,        roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main' },
  // Manager: goes to /manager/orders
  { label: '(G) Global Orders',    href: '/manager/orders',         icon: ClipboardList,        roles: ['MANAGER'],                                                            group: 'main' },
  // Accountant: goes to /accountant/orders (scoped hub)
  { label: '(G) Global Orders',    href: '/accountant/orders',      icon: ClipboardList,        roles: ['ACCOUNTANT'],                                                         group: 'main' },
  // Acdema: goes to /acdema/orders (their own hub)
  { label: '(G) Global Orders',    href: '/acdema/orders',          icon: ClipboardList,        roles: ['ACDEMA'],                                                             group: 'main' },
  // Shop-floor roles: each gets their own scoped /[role]/orders page
  { label: '(G) Global Orders',    href: '/designer/orders',        icon: ClipboardList,        roles: ['DESIGNER'],                                                           group: 'main' },
  { label: '(G) Global Orders',    href: '/printer/orders',         icon: ClipboardList,        roles: ['PRINTER'],                                                            group: 'main' },
  { label: '(G) Global Orders',    href: '/pasting/orders',         icon: ClipboardList,        roles: ['PASTING'],                                                            group: 'main' },
  { label: '(G) Global Orders',    href: '/finishing/orders',       icon: ClipboardList,        roles: ['FINISHING'],                                                          group: 'main' },
  { label: '(G) Global Orders',    href: '/dispatch/orders',        icon: ClipboardList,        roles: ['DISPATCH'],                                                           group: 'main' },
  // ── Manager dashboards ────────────────────────────────────────────────────
  { label: 'Unassigned Backlog',   href: '/manager/unassigned',      icon: ClipboardList,        roles: ['MANAGER'],                                                            group: 'main'    },
  { label: 'Active Jobs',          href: '/manager/assigned',        icon: Activity,             roles: ['MANAGER'],                                                            group: 'main'    },
  { label: 'Manage Customers',     href: '/manager/customers',      icon: Users,                roles: ['MANAGER', 'SUPPORT', 'DESIGNER'],                                      group: 'main'    },
  { label: 'Production Dashboard', href: '/manager',                icon: LayoutDashboard,      roles: ['MANAGER', 'DESIGNER'],                                                group: 'main'    },

  // ── Role-specific dashboards ──────────────────────────────────────────────
  { label: 'Support Dashboard',    href: '/support',                icon: Headphones,           roles: ['SUPPORT'],                                                            group: 'main'    },
  { label: 'Design Studio',        href: '/designer',               icon: Palette,              roles: ['DESIGNER'],                                                           group: 'main'    },
  { label: 'Active Jobs',          href: '/designer/active-jobs',   icon: Activity,             roles: ['DESIGNER'],                                                           group: 'main'    },
  { label: 'All Active Jobs',      href: '/designer/all-active-jobs', icon: ClipboardList,      roles: ['DESIGNER'],                                                           group: 'main'    },
  { label: 'Pasting Dashboard',    href: '/pasting',                icon: ClipboardList,        roles: ['PASTING'],                                                            group: 'main'    },
  { label: 'Finishing Dashboard',  href: '/finishing',              icon: CheckCircle,          roles: ['FINISHING'],                                                          group: 'main'    },
  { label: 'Customer Approved Payments', href: '/accountant',       icon: Activity,             roles: ['ACCOUNTANT'],                                                         group: 'main'    },
  { label: 'Customer Payment Approvals', href: '/accountant/payments', icon: ReceiptIndianRupee, roles: ['ACCOUNTANT'],                                                       group: 'main'    },
  { label: 'Tally Masters',        href: '/tally-masters',          icon: Users,                roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'ACDEMA'],                       group: 'main'    },
  { label: 'Dispatch',             href: '/dispatch',               icon: Truck,                roles: ['DISPATCH'],                                                           group: 'main'    },
  { label: 'Pending Deliveries',   href: '/delivary',               icon: ClipboardList,        roles: ['DELIVERY'],                                                           group: 'main'    },
  { label: 'Delivered Orders',     href: '/delivared',              icon: CheckCircle,          roles: ['DELIVERY'],                                                           group: 'main'    },


  // ── Accounting Dashboard (Pixel Accounting) ─────────────────────────────
  { label: '(Z) Pixel Accounting', href: '#dubbl-accounting', icon: BookOpen, roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA'], group: 'main', subItems: [
    { label: 'Banking & Cash Drawer', href: '/accounting/banking' },
    { label: 'Contra Voucher', href: '/accounting/contra' },
    { label: 'Journal Voucher', href: '/accounting/journal' },
    { label: 'Chart of Accounts & Ledger', href: '/accounting/transactions' },
    { label: 'Invoices & Sales Receipts', href: '/accounting/sales' },
    { label: 'Bills & Purchases', href: '/accounting/purchases' },
    { label: 'Financial Reports', href: '/accounting/reports' },
    { label: 'Tax Settings', href: '/accounting/tax' },
  ] },

  // ── Universal bottom ──────────────────────────────────────────────────────
  { label: 'Settings',             href: '/settings',               icon: Settings,             roles: ['ADMIN','SUPER_ADMIN','MANAGER','PRINTER','ACCOUNTANT','CUSTOMER','DESIGNER','SUPPORT','DISPATCH','DELIVERY'], group: 'bottom' },
];
