import { StaffRole, StaffStatus } from './roles';
export type { StaffRole };

// ─── UserRole ─────────────────────────────────────────────────────────────────
// Keep the union type for middleware / cookie compatibility.
// Staff members now carry `roles: StaffRole[]` in their profile.
export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'ACDEMA'
  | 'ACCOUNTANT'
  | 'DESIGNER'
  | 'PRINTER'
  | 'PASTING'
  | 'FINISHING'
  | 'DISPATCH'
  | 'DELIVERY'
  | 'SUPPORT'
  | 'CUSTOMER';

export type RoleView = Exclude<UserRole, 'ADMIN' | 'SUPER_ADMIN' | 'CUSTOMER'>;

export interface DeliveryAddress {
  id: string; // unique ID
  pincode: string;
  state: string;
  city: string;
  houseNumber: string; // House No., Building Name
  roadName: string; // Road Name, Area, Colony
  isDefault?: boolean;
}

// ─── UserProfile ──────────────────────────────────────────────────────────────
export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  displayName?: string;
  photoURL?: string;

  // LEGACY — single role. Kept for Customer accounts and backward compat.
  role: UserRole;

  // PHASE 2 — multi-role array for staff members.
  // Derived from `role` on first load if missing (backward compat).
  roles?: StaffRole[];

  // PRINTER sub-category — only set when role === 'PRINTER'
  printerCategory?: string;

  // Staff-only status. Customers remain ACTIVE implicitly.
  status: 'ACTIVE' | 'BLOCKED' | StaffStatus;

  // Customer fields (required for customers, 0-defaulted for staff)
  customerType: 'CASH' | 'CREDIT';
  creditLimit: number;
  usedCredit: number;
  creditStatus?: 'PENDING_APPROVAL' | 'APPROVED';
  businessName?: string;
  company_name?: string;
  contact_person?: string;
  phone?: string;
  alternate_mobile?: string;
  pan_number?: string;
  address?: string; // Legacy single address
  addresses?: DeliveryAddress[]; // New structured address book
  defaultAddressId?: string;
  billing_address_line1?: string;
  billing_address_line2?: string;
  billing_area?: string;
  billing_city?: string;
  billing_district?: string;
  billing_state?: string;
  billing_state_code?: string;
  billing_pincode?: string;
  billing_country?: string;
  shipping_same_as_billing?: boolean;
  consignee_name?: string;
  consignee_contact?: string;
  consignee_mobile?: string;
  consignee_gstin?: string;
  shipping_address_line1?: string;
  shipping_address_line2?: string;
  shipping_area?: string;
  shipping_city?: string;
  shipping_district?: string;
  shipping_state?: string;
  shipping_state_code?: string;
  shipping_pincode?: string;
  shipping_country?: string;
  state?: string;
  country?: string;
  pincode?: string;
  gstType?: 'Regular' | 'Composition' | 'Unregistered';
  gstNumber?: string;
  gstVerified?: boolean;
  gstDetails?: any;
  voucherType?: 'Type 0' | 'Type 1';
  membership?: {
    tier: 'STANDARD' | 'GOLD' | 'PLATINUM';
    totalSpend: number;
    nextTierAt: number;
    totalEarned?: number;
    loyaltyPoints?: number;
  };

  createdAt: any;
  updatedAt?: any;
  lastLogin?: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the effective roles array for any profile.
 * - Staff with roles[] → returns as-is.
 * - Legacy staff with only `role` → wraps in array.
 * - Customers → returns empty array (no staff roles).
 */
export function getEffectiveRoles(profile: UserProfile | null, tokenRole?: string): StaffRole[] {
  const roleToUse = profile?.role || tokenRole;
  if (!roleToUse || roleToUse === 'CUSTOMER') return [];
  
  const rolesSet = new Set<StaffRole>();
  if (roleToUse) rolesSet.add(roleToUse as StaffRole);
  if (Array.isArray(profile?.roles)) {
    profile!.roles.forEach(r => rolesSet.add(r));
  }
  
  let baseRoles: StaffRole[] = Array.from(rolesSet);

  // ACDEMA semantic: accounts entrypoint should include core staff roles by default
  // so ACDEMA users can access Accountant/Designer/Manager workflows unless explicitly removed.
  if (baseRoles.includes('ACDEMA')) {
    const expanded = new Set<StaffRole>(baseRoles);
    expanded.add('ACCOUNTANT');
    expanded.add('DESIGNER');
    expanded.add('MANAGER');
    return Array.from(expanded);
  }

  return baseRoles;
}

/**
 * Returns true if the profile has ANY of the required roles.
 * ADMIN and SUPER_ADMIN bypass all restrictions.
 */
export function profileHasRole(profile: UserProfile | null, requiredRoles: StaffRole[]): boolean {
  const effective = getEffectiveRoles(profile);
  if (effective.includes('ADMIN') || effective.includes('SUPER_ADMIN')) return true;
  return requiredRoles.some(r => effective.includes(r));
}

// ─── Role → default redirect route ──────────────────────────────────────────
export const ROLE_ROUTES: Record<UserRole, string> = {
  SUPER_ADMIN: '/admin/orders',
  ADMIN: '/admin/orders',
  MANAGER: '/manager',
  ACDEMA: '/acdema/orders',
  ACCOUNTANT: '/accountant',
  DESIGNER: '/designer',
  PRINTER: '/printer/queue',
  PASTING: '/pasting',
  FINISHING: '/finishing',
  DISPATCH: '/dispatch',
  DELIVERY: '/delivarypartner',
  SUPPORT: '/support',
  CUSTOMER: '/customer',
};

/** Returns the best default dashboard route for a profile. */
export function getDefaultRoute(profile: UserProfile | null): string {
  if (!profile) return '/';

  if (ROLE_ROUTES[profile.role]) {
    return ROLE_ROUTES[profile.role];
  }

  const effectiveRoles = getEffectiveRoles(profile);
  for (const role of effectiveRoles) {
    if (ROLE_ROUTES[role as UserRole]) {
      return ROLE_ROUTES[role as UserRole];
    }
  }

  return '/';
}

// ─── Workstation / Module Routes ─────────────────────────────────────────────
export const MODULE_ROUTES: Record<StaffRole, string> = {
  SUPER_ADMIN: '/admin/orders',
  ADMIN: '/admin/orders',
  MANAGER: '/manager',
  ACDEMA: '/acdema/orders',
  ACCOUNTANT: '/accountant',
  DESIGNER: '/designer',
  PRINTER: '/printer/queue',
  PASTING: '/pasting',
  FINISHING: '/finishing',
  DISPATCH: '/dispatch',
  DELIVERY: '/delivarypartner',
  SUPPORT: '/support',
};
