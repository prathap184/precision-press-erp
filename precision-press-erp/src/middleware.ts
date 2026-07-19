import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const staffRole = req.cookies.get('role')?.value;
  const customerRole = req.cookies.get('customer_role')?.value;
  const role = staffRole || customerRole;
  const { pathname } = req.nextUrl;

  // 1. Instant Dashboard Redirect (Root -> Dashboard) for Authenticated Users
  if (pathname === '/') {
    if (role) {
      const routes: Record<string, string> = {
        SUPER_ADMIN: '/super-admin',
        ADMIN: '/admin',
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
        CUSTOMER: 'CUSTOMER_PORTAL',
      };
      if (role === 'CUSTOMER') {
        // Prevent customers from accessing the Staff ERP. 
        // Since no links are allowed, just redirect to the generic staff login.
        return NextResponse.redirect(new URL('/staff-login', req.url));
      }
      return NextResponse.redirect(new URL(routes[role] || '/staff-login', req.url));
    }
    // If not logged in, just explicitly return next() so they see the landing page!
    return NextResponse.next();
  }

  // 2. Auth Protection (Redirect to login if accessing protected routes without a role)
  const isDashboardRoute = pathname.startsWith('/admin') || 
                           pathname.startsWith('/manager') || 
                           pathname.startsWith('/accountant') || 
                           pathname.startsWith('/designer') || 
                           pathname.startsWith('/printer') || 
                           pathname.startsWith('/pasting') || 
                           pathname.startsWith('/finishing') || 
                           pathname.startsWith('/dispatch') || 
                           pathname.startsWith('/delivery') || 
                           pathname.startsWith('/delivarypartner') || 
                           pathname.startsWith('/support') || 
                           pathname.startsWith('/customer');

  if (isDashboardRoute) {
    if (!role) {
      return NextResponse.redirect(new URL('/staff-login', req.url));
    }
    
    // If a customer tries to access ERP routes, kick them to staff-login instead of linking out
    if (role === 'CUSTOMER') {
      return NextResponse.redirect(new URL('/staff-login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/manager/:path*', '/accountant/:path*', '/designer/:path*', '/printer/:path*', '/pasting/:path*', '/finishing/:path*', '/dispatch/:path*', '/delivery/:path*', '/delivarypartner/:path*', '/support/:path*', '/customer/:path*'],
};
