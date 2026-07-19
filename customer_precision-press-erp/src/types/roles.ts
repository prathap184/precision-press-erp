// ─── PHASE 1: Centralized Role System ────────────────────────────────────────
// Single source of truth for all staff roles in the ERP.
// CUSTOMER is intentionally excluded from StaffRole — it lives in UserRole only.

export type StaffRole =
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'MANAGER'
  | 'ACDEMA'
  | 'DESIGNER'
  | 'PRINTER'
  | 'PASTING'
  | 'FINISHING'
  | 'DISPATCH'
  | 'DELIVERY'
  | 'ACCOUNTANT'
  | 'SUPPORT';

// ─── Printer Category ─────────────────────────────────────────────────────────
// Sub-category for PRINTER role staff. Controls which orders a printer can see.
export type PrinterCategory =
  | 'MAIN_PRINTER'   // Supervisor – sees ALL printer jobs across all categories
  | 'SOLVENT_PRINT'
  | 'ECO_SOLVENT'
  | 'UV_PRINT'
  | 'LATEX_PRINT'
  | 'VINYL_PRINT'
  | 'FLEX_PRINT'
  | 'ID_CARDS'
  | 'DIGITAL_PRINT'
  | 'OTHER';

export interface PrinterCategoryMeta {
  label: string;
  color: string;
  bg: string;
}

export const PRINTER_CATEGORY_META: Record<PrinterCategory, PrinterCategoryMeta> = {
  MAIN_PRINTER:  { label: 'Main Printer',  color: '#7c3aed', bg: '#ede9fe' },
  SOLVENT_PRINT: { label: 'Solvent Print', color: '#ea580c', bg: '#fff7ed' },
  ECO_SOLVENT:   { label: 'Eco Solvent Print', color: '#16a34a', bg: '#dcfce7' },
  UV_PRINT:      { label: 'UV Print Roll', color: '#0891b2', bg: '#ecfeff' },
  LATEX_PRINT:   { label: 'UV Print Flat', color: '#db2777', bg: '#fdf2f8' },
  VINYL_PRINT:   { label: 'Vinyl Print', color: '#ca8a04', bg: '#fefce8' },
  FLEX_PRINT:    { label: 'Flex Print',  color: '#2563eb', bg: '#eff6ff' },
  ID_CARDS:      { label: 'ID Cards',    color: '#3b82f6', bg: '#eff6ff' },
  DIGITAL_PRINT: { label: 'Digital Print', color: '#eab308', bg: '#fefce8' },
  OTHER:         { label: 'Other',       color: '#64748b', bg: '#f1f5f9' },
};

export const ALL_PRINTER_CATEGORIES: PrinterCategory[] = [
  'MAIN_PRINTER',
  'SOLVENT_PRINT',
  'ECO_SOLVENT',
  'UV_PRINT',
  'LATEX_PRINT',
  'VINYL_PRINT',
  'FLEX_PRINT',
  'ID_CARDS',
  'DIGITAL_PRINT',
  'OTHER',
];



export interface RoleMeta {
  label: string;
  color: string;        // text / badge color (hex)
  bg: string;           // badge background color (hex)
  description: string;
}

export const ROLE_META: Record<StaffRole, RoleMeta> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    color: '#7c3aed',
    bg: '#ede9fe',
    description: 'Full system access, cannot be restricted',
  },
  ADMIN: {
    label: 'Admin',
    color: '#dc2626',
    bg: '#fee2e2',
    description: 'Company admin, manages staff and settings',
  },
  MANAGER: {
    label: 'Manager',
    color: '#2563eb',
    bg: '#dbeafe',
    description: 'Manages orders, assignments and production flow',
  },
  ACDEMA: {
    label: 'Acdema',
    color: '#0f766e',
    bg: '#ccfbf1',
    description: 'Proxy order entry for customer, payment and printer handoff',
  },
  DESIGNER: {
    label: 'Designer',
    color: '#9333ea',
    bg: '#f3e8ff',
    description: 'Artwork, proofing and design approvals',
  },
  PRINTER: {
    label: 'Printer',
    color: '#ea580c',
    bg: '#ffedd5',
    description: 'Production queue and printing operations',
  },
  PASTING: {
    label: 'Pasting',
    color: '#0f766e',
    bg: '#ccfbf1',
    description: 'Laminate, mount and attach stage proof before completion',
  },
  FINISHING: {
    label: 'Finishing',
    color: '#2563eb',
    bg: '#dbeafe',
    description: 'Final stage review, proof upload and handoff completion',
  },
  DISPATCH: {
    label: 'Dispatch',
    color: '#0891b2',
    bg: '#cffafe',
    description: 'Logistics, handover and delivery tracking',
  },
  DELIVERY: {
    label: 'Delivery',
    color: '#0369a1',
    bg: '#e0f2fe',
    description: 'Final delivery to customer or site',
  },
  ACCOUNTANT: {
    label: 'Accountant',
    color: '#059669',
    bg: '#d1fae5',
    description: 'Payments, ledger and financial reporting',
  },
  SUPPORT: {
    label: 'Support',
    color: '#64748b',
    bg: '#f1f5f9',
    description: 'Customer support and order assistance',
  },
};

/** Roles that have god-mode access (bypass all restrictions) */
export const SUPERUSER_ROLES: StaffRole[] = ['ADMIN', 'SUPER_ADMIN'];

/** Returns true if any of the user's roles grant access to the required roles */
export function hasAnyRole(userRoles: StaffRole[], requiredRoles: StaffRole[]): boolean {
  if (userRoles.some(r => SUPERUSER_ROLES.includes(r))) return true;
  return requiredRoles.some(r => userRoles.includes(r));
}

/** Ordered list of all assignable staff roles (for dropdowns/UI) */
export const ALL_STAFF_ROLES: StaffRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'ACDEMA',
  'DESIGNER',
  'PRINTER',
  'PASTING',
  'FINISHING',
  'DISPATCH',
  'DELIVERY',
  'ACCOUNTANT',
  'SUPPORT',
];

// ─── Staff User (Firestore: staff_users/{uid}) ────────────────────────────────
export type StaffStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface StaffUser {
  uid: string;
  name: string;
  email: string;
  roles: StaffRole[];
  status: StaffStatus;
  printerCategory?: PrinterCategory;
  assignedBy?: string;
  assignedAt?: any;
  updatedAt?: any;
  suspendedAt?: any;
  lastLoginAt?: any;
}

// ─── Role History (Firestore: role_history/{id}) ──────────────────────────────
export interface RoleHistoryEntry {
  id?: string;
  userId: string;
  userName: string;
  oldRoles: StaffRole[];
  newRoles: StaffRole[];
  changedBy: string;
  changedByName: string;
  changedAt: any;
  reason?: string;
  action: 'ASSIGN' | 'REMOVE' | 'UPDATE' | 'SUSPEND' | 'ACTIVATE' | 'DISABLE';
}
