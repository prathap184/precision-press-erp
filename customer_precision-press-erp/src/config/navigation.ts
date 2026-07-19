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
}

// ─── PHASE 8: Module Registry ─────────────────────────────────────────────────
// Each module maps to one or more roles. Sidebar filters this list live
// based on the user's current `roles` array from the real-time auth context.

export const NAVIGATION_ITEMS: NavItem[] = [
  // ── Customer ──────────────────────────────────────────────────────────────
  { label: 'Browse Products',      href: '/categories',    icon: Layers,               roles: ['CUSTOMER'],                                                           group: 'main'    },
  { label: 'Multi Order',          href: '/multi-order',   icon: ShoppingCart,         roles: ['CUSTOMER'],                                                           group: 'main'    },
  { label: 'My Dashboard',         href: '/',              icon: LayoutDashboard,      roles: ['CUSTOMER'],                                                           group: 'main'    },
  { label: 'All Orders',           href: '/orders',        icon: ShoppingCart,         roles: ['CUSTOMER'],                                                           group: 'main'    },
  { label: 'Cart',                 href: '/cart',          icon: ShoppingCart,         roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'Account Ledger',       href: '/ledger',        icon: Activity,             roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'Report Payment',       href: '/payment',       icon: CreditCard,           roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'Request Payment',      href: '/request-payment', icon: ReceiptIndianRupee, roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'Membership',           href: '/membership',    icon: Star,                 roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'My Profile',           href: '/profile',       icon: User,                 roles: ['CUSTOMER'],                                                           group: 'account' },
  { label: 'My Documents',         href: '/documents',     icon: FileText,             roles: ['CUSTOMER'],                                                           group: 'account' },
  
  // ── Universal bottom ──────────────────────────────────────────────────────
  { label: 'Settings',             href: '/settings',      icon: Settings,             roles: ['CUSTOMER'], group: 'bottom' },
];
