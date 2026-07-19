import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Staff roles that are NOT allowed in the Customer Portal ──────────────────
const STAFF_ROLES = new Set([
  'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACDEMA', 'DESIGNER',
  'PRINTER', 'PASTING', 'FINISHING', 'DISPATCH', 'DELIVERY',
  'ACCOUNTANT', 'SUPPORT',
]);

// ─── Routes that require authentication ───────────────────────────────────────
const PROTECTED_PREFIXES = [
  '/dashboard', '/orders', '/cart', '/payment', '/request-payment',
  '/ledger', '/membership', '/pricelist', '/documents', '/files',
  '/profile', '/settings', '/new-order', '/multi-order',
  '/categories', '/product',
];

export function middleware(req: NextRequest) {
  const customerRole = req.cookies.get('customer_role')?.value;
  const staffRole = req.cookies.get('role')?.value;
  const role = customerRole || staffRole;
  const { pathname } = req.nextUrl;

  // 1. If a STAFF member lands here -> block them or redirect to /login
  if (role && STAFF_ROLES.has(role)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 2. If not authenticated and on a protected route → redirect to /login
  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
  if (isProtected && !role) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 3. If already authenticated and on /login → redirect to /dashboard
  if (pathname === '/login' && role === 'CUSTOMER') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // 4. Redirect root (/) to /dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard/:path*',
    '/orders/:path*',
    '/cart/:path*',
    '/payment/:path*',
    '/request-payment/:path*',
    '/ledger/:path*',
    '/membership/:path*',
    '/pricelist/:path*',
    '/documents/:path*',
    '/files/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/new-order/:path*',
    '/multi-order/:path*',
    '/categories/:path*',
    '/product/:path*',
  ],
};
