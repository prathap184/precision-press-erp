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
  { label: 'Command Center',       href: '/staff',                  icon: Command,              roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACDEMA', 'DESIGNER', 'PRINTER', 'DISPATCH', 'DELIVERY', 'ACCOUNTANT', 'SUPPORT'], group: 'main' },
  { label: 'Global Orders',        href: '/acdema/orders',         icon: ClipboardList,        roles: ['ACDEMA'],                                                             group: 'main' },
  { label: 'Jobs Passed By Me',    href: '/acdema?view=passed',    icon: UserCheck,           roles: ['ACDEMA'],                                                             group: 'main' },
  { label: 'All Jobs',             href: '/acdema?view=all',       icon: ClipboardList,        roles: ['ACDEMA'],                                                             group: 'main' },
  { label: 'Jobs At My Stage',     href: '/acdema?view=my-stage',  icon: AlertCircle,          roles: ['ACDEMA'],                                                             group: 'main' },

  // ── Admin / Super Admin ─────────────────────────────────────────────
  { label: 'Ops Dashboard',        href: '/admin',                  icon: LayoutDashboard,      roles: ['ADMIN', 'SUPER_ADMIN', 'SUPPORT'],                                    group: 'main'    },
  { label: 'Job Queue',            href: '/admin/job-queue',        icon: Activity,             roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main'    },
  { label: 'Product Management',   href: '/admin/products',         icon: PackageCheck,         roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main'    },
  { label: 'Staff Management',     href: '/admin/staff',            icon: Users,                roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main'    },
  { label: 'Customer Management',  href: '/admin/customers',        icon: Users,                roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main'    },
  { label: 'Supplier Ledgers',     href: '/admin/suppliers',        icon: Building2,            roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],                                 group: 'main'    },
  { label: 'GST Details',          href: '/admin/gst-info',         icon: Building2,            roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main'    },
  { label: 'HSN Master',           href: '/admin/hsn-master',       icon: Receipt,              roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main'    },
  { label: 'GST & Invoice Settings', href: '/admin/settings/gst-invoice', icon: FileSpreadsheet,   roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main'    },
  { label: 'Global Orders',        href: '/admin/orders',           icon: ClipboardList,        roles: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'DISPATCH', 'ACCOUNTANT', 'SUPPORT'], group: 'main'    },
  { label: 'Invoices',             href: '/admin/invoices',         icon: FileText,             roles: ['ADMIN', 'SUPER_ADMIN'],                                               group: 'main'    },
  { label: 'Invoice Generation',   href: '/admin/invoice-generation', icon: FilePlus2,           roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],                                 group: 'main'    },
  { label: 'Unassigned Backlog',   href: '/manager/unassigned',      icon: ClipboardList,        roles: ['MANAGER'],                                                            group: 'main'    },
  { label: 'Active Jobs',          href: '/manager/assigned',        icon: Activity,             roles: ['MANAGER'],                                                            group: 'main'    },
  { label: 'Manage Customers',     href: '/manager/customers',      icon: Users,                roles: ['MANAGER', 'SUPPORT', 'DESIGNER'],                                      group: 'main'    },
  { label: 'Production Dashboard', href: '/manager',                icon: LayoutDashboard,      roles: ['MANAGER', 'DESIGNER'],                                                group: 'main'    },
  
  // ── Role-specific dashboards ──────────────────────────────────────────────
  { label: 'Support Dashboard',    href: '/support',                icon: Headphones,           roles: ['SUPPORT'],                                                            group: 'main'    },
  { label: 'Design Studio',        href: '/designer',               icon: Palette,              roles: ['DESIGNER'],                                                           group: 'main'    },
  { label: 'Active Jobs',          href: '/designer/active-jobs',   icon: Activity,             roles: ['DESIGNER'],                                                           group: 'main'    },
  { label: 'All Active Jobs',      href: '/designer/all-active-jobs', icon: ClipboardList,      roles: ['DESIGNER'],                                                           group: 'main'    },
  // { label: 'Production Queue',     href: '/printer/queue',          icon: Printer,              roles: ['PRINTER'],                                                            group: 'main'    },
  // { label: 'Assign to Printer',    href: '/printer/assign',         icon: Printer,              roles: ['PRINTER'],                                                            group: 'main'    },
  // { label: 'All Assigned Orders',  href: '/printer/orders',         icon: Activity,             roles: ['PRINTER'],                                                            group: 'main'    },
  { label: 'Pasting Dashboard',    href: '/pasting',                icon: ClipboardList,        roles: ['PASTING'],                                                            group: 'main'    },
  { label: 'Finishing Dashboard',  href: '/finishing',              icon: CheckCircle,          roles: ['FINISHING'],                                                          group: 'main'    },
  { label: 'Company Finance',      href: '#company',                icon: Building2,            roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],                                 group: 'main', subItems: [
    { label: 'Balance Sheet', href: '/accountant/balance-sheet' },
    { label: 'Day Book', href: '/accountant/day-book' },
    { label: 'General Ledger', href: '/accountant/general-ledger' },
    { label: 'Company Ledger', href: '/accountant/company-ledger' },
    { label: 'Cash Ledger', href: '/accountant/cash-ledger' },
    { label: 'Bank Ledgers', href: '/accountant/bank-ledger' },
  ] },
  { label: 'Approved Payments',    href: '/accountant',             icon: Activity,             roles: ['ACCOUNTANT'],                                                         group: 'main'    },
  { label: 'Payment Approvals',    href: '/accountant/payments',    icon: ReceiptIndianRupee,   roles: ['ACCOUNTANT'],                                                         group: 'main'    },
  { label: 'Accounts Ledger',      href: '/accountant/ledger',      icon: Activity,             roles: ['ACCOUNTANT'],                                                         group: 'main'    },
  { label: 'Accountant Tally',     href: '/accountant-tally',       icon: Calculator,           roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'],                                 group: 'main'    },
  { label: 'Sales Register',       href: '/sales-register',         icon: FileText,             roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'ACDEMA'],                       group: 'main'    },
  { label: 'Receipt Register',     href: '/receipt-register',       icon: ClipboardList,        roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'ACDEMA'],                       group: 'main'    },
  { label: 'Receipt Entry (Payment)', href: '/receipt-entry',       icon: Wallet,               roles: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'ACDEMA'],                       group: 'main'    },
  { label: 'Invoices',             href: '/accountant/invoices',    icon: FileText,             roles: ['ACCOUNTANT'],                                                         group: 'main'    },
  { label: 'Dispatch',             href: '/dispatch',               icon: Truck,                roles: ['DISPATCH'],                                                           group: 'main'    },
  { label: 'Pending Deliveries',   href: '/delivary',               icon: ClipboardList,        roles: ['DELIVERY'],                                                           group: 'main'    },
  { label: 'Delivered Orders',     href: '/delivared',              icon: CheckCircle,          roles: ['DELIVERY'],                                                           group: 'main'    },

  // ── Universal bottom ──────────────────────────────────────────────────────
  { label: 'Settings',             href: '/settings',               icon: Settings,             roles: ['ADMIN','SUPER_ADMIN','MANAGER','PRINTER','ACCOUNTANT','CUSTOMER','DESIGNER','SUPPORT','DISPATCH','DELIVERY'], group: 'bottom' },
];
