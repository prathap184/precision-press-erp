import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: '/admin/orders',
  ADMIN: '/admin/orders',
  MANAGER: '/manager/dashboard',
  ACDEMA: '/acdema/orders',
  ACCOUNTANT: '/accountant/payments',
  DESIGNER: '/designer',
  PRINTER: '/printer/queue',
  PASTING: '/pasting',
  FINISHING: '/finishing',
  DISPATCH: '/dispatch',
  DELIVERY: '/delivarypartner',
  SUPPORT: '/support',
  CUSTOMER: '/customer',
};

// Strict RBAC route definitions. Most specific paths appear first!
const ROUTE_PERMISSIONS: { prefix: string; allowed: string[] }[] = [
  { prefix: '/super-admin', allowed: ['SUPER_ADMIN'] },
  // ── Role-scoped Global Orders pages (must come BEFORE generic role prefix) ──
  { prefix: '/designer/orders',  allowed: ['DESIGNER',  'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/printer/orders',   allowed: ['PRINTER',   'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/pasting/orders',   allowed: ['PASTING',   'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/finishing/orders', allowed: ['FINISHING', 'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/dispatch/orders',  allowed: ['DISPATCH',  'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/support/orders',   allowed: ['SUPPORT',   'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/manager/orders',   allowed: ['MANAGER',   'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/accountant/orders', allowed: ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'] },
  // ── Shared global orders view for operations staff ─────────────────────────
  { prefix: '/admin/orders', allowed: ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT'] },
  // ── Admin management: STRICTLY ADMIN & SUPER_ADMIN only ───────────────────
  { prefix: '/admin', allowed: ['ADMIN', 'SUPER_ADMIN'] },
  // ── Acdema dashboard: STRICTLY ACDEMA & SUPER_ADMIN ──────────────────────
  { prefix: '/acdema', allowed: ['ACDEMA', 'SUPER_ADMIN'] },
  // ── Designer creative studio ──────────────────────────────────────────────
  { prefix: '/designer', allowed: ['DESIGNER', 'ADMIN', 'SUPER_ADMIN'] },
  // ── Delivery hubs ─────────────────────────────────────────────────────────
  { prefix: '/delivarypartner', allowed: ['DELIVERY', 'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/delivary',        allowed: ['DELIVERY', 'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/delivared',       allowed: ['DELIVERY', 'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/delivery',        allowed: ['DELIVERY', 'ADMIN', 'SUPER_ADMIN'] },
  // ── Operations roles ──────────────────────────────────────────────────────
  { prefix: '/manager',   allowed: ['MANAGER',   'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/pasting',   allowed: ['PASTING',   'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/finishing', allowed: ['FINISHING', 'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/printer',   allowed: ['PRINTER',   'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/dispatch',  allowed: ['DISPATCH',  'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/support',   allowed: ['SUPPORT',   'ADMIN', 'SUPER_ADMIN'] },
  // ── Accounting & Finance ──────────────────────────────────────────────────
  { prefix: '/accountant',       allowed: ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/accounting',       allowed: ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
  { prefix: '/tally-masters',    allowed: ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN', 'ACDEMA'] },
  { prefix: '/sales-register',   allowed: ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/receipt-register', allowed: ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'] },
  { prefix: '/receipt-entry',    allowed: ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'] },
  // ── Customer portal ───────────────────────────────────────────────────────
  { prefix: '/customer', allowed: ['CUSTOMER'] },
];

export function middleware(req: NextRequest) {
  const staffRole = req.cookies.get('role')?.value;
  const staffRolesRaw = req.cookies.get('roles')?.value;
  const customerRole = req.cookies.get('customer_role')?.value;
  const role = staffRole || customerRole;
  const { pathname } = req.nextUrl;

  let userRoles: string[] = [];
  try {
    if (staffRolesRaw) {
      const parsed = JSON.parse(decodeURIComponent(staffRolesRaw));
      if (Array.isArray(parsed)) {
        userRoles = parsed.map((r: any) => String(r).toUpperCase());
      }
    }
  } catch {}

  if (staffRole && !userRoles.includes(staffRole.toUpperCase())) {
    userRoles.push(staffRole.toUpperCase());
  }
  if (customerRole && !userRoles.includes(customerRole.toUpperCase())) {
    userRoles.push(customerRole.toUpperCase());
  }

  // 1. Instant Dashboard Redirect (Root -> User Dashboard) for Authenticated Users
  if (pathname === '/') {
    if (role) {
      if (role === 'CUSTOMER') {
        return NextResponse.redirect(new URL('/staff-login', req.url));
      }
      return NextResponse.redirect(new URL(ROLE_HOME[role] || '/staff-login', req.url));
    }
    return NextResponse.next();
  }

  // 2. Find matching protected route rule
  const matchedRule = ROUTE_PERMISSIONS.find(
    (rule) => pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')
  );

  if (matchedRule) {
    // If not authenticated, redirect to staff login
    if (!role && userRoles.length === 0) {
      return NextResponse.redirect(new URL('/staff-login', req.url));
    }

    // Customers cannot access any staff ERP route
    if (userRoles.includes('CUSTOMER') && userRoles.length === 1 && matchedRule.prefix !== '/customer') {
      return NextResponse.redirect(new URL('/staff-login', req.url));
    }

    // Superusers have god-mode bypass
    const isSuperuser = userRoles.includes('ADMIN') || userRoles.includes('SUPER_ADMIN');

    // Strict multi-role enforcement: user must possess AT LEAST ONE role matching the route's allowed roles
    const isAllowed = isSuperuser || matchedRule.allowed.some((r) => userRoles.includes(r));

    if (!isAllowed) {
      const primaryRole = staffRole || userRoles[0] || 'CUSTOMER';
      const targetHome = ROLE_HOME[primaryRole] || '/staff-login';
      return NextResponse.redirect(new URL(targetHome, req.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/super-admin/:path*',
    '/admin/:path*',
    '/acdema/:path*',
    // Role-scoped orders pages (must be listed before generic role paths)
    '/designer/orders/:path*',
    '/printer/orders/:path*',
    '/pasting/orders/:path*',
    '/finishing/orders/:path*',
    '/dispatch/orders/:path*',
    '/support/orders/:path*',
    '/manager/orders/:path*',
    '/accountant/orders/:path*',
    // Generic role dashboards
    '/designer/:path*',
    '/delivarypartner/:path*',
    '/delivary/:path*',
    '/delivared/:path*',
    '/delivery/:path*',
    '/manager/:path*',
    '/pasting/:path*',
    '/finishing/:path*',
    '/printer/:path*',
    '/dispatch/:path*',
    '/support/:path*',
    '/accountant/:path*',
    '/accounting/:path*',
    '/tally-masters/:path*',
    '/sales-register/:path*',
    '/receipt-register/:path*',
    '/receipt-entry/:path*',
    '/customer/:path*',
  ],
};
