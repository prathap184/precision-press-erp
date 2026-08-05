'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export type MenuState = null | 'VOUCHERS' | 'DISPLAY_REPORTS' | 'DAY_REPORT' | 'ACCOUNT_BOOKS' | 'LEDGERS';

const PARENT_ROUTE_MAP: Record<string, string> = {
  '/admin/staff': '/admin/orders',
  '/proxy-order': '/admin/orders',
  '/pixel-orders': '/admin/orders',
  '/sales/invoices/new': '/sales/invoices',
  '/sales/invoices': '/sales',
  '/sales/quotes': '/sales',
  '/quotation-builder': '/sales/quotes',
  '/sales/customer-prepayments': '/sales',
  '/accounting/sales/customer-prepayments': '/sales',
  '/sales/receipts': '/sales',
  '/sales': '/admin/orders',
  '/accounting/banking': '/accounting',
  '/purchases': '/accounting',
  '/accounting/accounts': '/accounting',
  '/reports/day-book': '/reports',
  '/reports/general-ledger': '/reports',
  '/reports': '/accounting',
  '/accounting': '/admin/orders',
  '/contacts': '/admin/orders',
  '/accounting/inventory': '/admin/orders',
  '/projects': '/admin/orders',
};

export function getParentRoute(pathname: string): string {
  const cleanPath = pathname.split('?')[0].replace(/\/$/, '');
  if (!cleanPath || cleanPath === '/admin/orders') return '/admin/orders';
  if (PARENT_ROUTE_MAP[cleanPath]) return PARENT_ROUTE_MAP[cleanPath];
  if (cleanPath.startsWith('/acdema/orders/')) return '/admin/orders';
  if (cleanPath.startsWith('/sales/invoices/')) return '/sales/invoices';
  if (cleanPath.startsWith('/sales/quotes/')) return '/sales/quotes';
  if (cleanPath.startsWith('/contacts')) return '/admin/orders';
  if (cleanPath.startsWith('/admin/')) return '/admin/orders';
  return '/admin/orders';
}

export function useGlobalShortcuts() {
  const [menuState, setMenuState] = useState<MenuState>(null);
  const router = useRouter();
  const { profile } = useAuth();

  const closeMenu = useCallback(() => setMenuState(null), []);

  useEffect(() => {
    const allowedRoles = ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'ACDEMA'];
    if (!profile || !allowedRoles.includes(profile.role)) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable element
      const activeElement = document.activeElement as HTMLElement;
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable)
      ) {
        return;
      }

      // Ignore shortcut handling when modifier keys (Ctrl, Cmd, Alt) are pressed
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Close menu on Escape, or navigate up parent route in hierarchy tree
      if (e.key === 'Escape') {
        if (menuState !== null) {
          closeMenu();
        } else {
          const currentPath = window.location.pathname;
          if (currentPath !== '/admin/orders') {
            const parent = getParentRoute(currentPath);
            if (parent === '/admin/orders' && process.env.NEXT_PUBLIC_PIXEL_MARKETING_URL) {
              window.location.href = `${process.env.NEXT_PUBLIC_PIXEL_MARKETING_URL}/admin/orders`;
            } else {
              router.push(parent);
            }
          }
        }
        return;
      }

      // Root shortcuts when no menu is open
      if (menuState === null) {
        const key = e.key.toLowerCase();
        if (key === 'v') {
          e.preventDefault();
          setMenuState('VOUCHERS');
        } else if (key === 'd') {
          e.preventDefault();
          setMenuState('DISPLAY_REPORTS');
        } else if (key === 'n') {
          e.preventDefault();
          router.push('/proxy-order');
        } else if (key === 'g') {
          e.preventDefault();
          router.push('/admin/orders');
        } else if (key === 'z') {
          e.preventDefault();
          router.push('/accounting-redirect');
        } else if (key === 'c') {
          e.preventDefault();
          window.location.href = `${process.env.NEXT_PUBLIC_DUBBL_URL || 'http://localhost:3001'}/sales/receipts`;
        }
      } 
      // Vouchers Menu Shortcuts
      else if (menuState === 'VOUCHERS') {
        const isFunctionKey = /^F(4|5|6|7|8|9|10)$/.test(e.key);
        if (isFunctionKey) {
          e.preventDefault();
          if (e.key === 'F8') {
            router.push('/sales');
          } else if (e.key === 'F10') {
            router.push('/quotation-builder');
          } else if (e.key === 'F6') {
            router.push('/sales/customer-prepayments');
          } else if (e.key === 'F5') {
            router.push('/purchases');
          } else if (e.key === 'F4') {
            router.push('/accounting/banking');
          } else if (e.key === 'F7') {
            router.push('/accounting');
          }
          closeMenu();
        }
      } 
      // Display Reports Menu Shortcuts
      else if (menuState === 'DISPLAY_REPORTS') {
        const key = e.key.toLowerCase();
        if (key === 'd') {
          e.preventDefault();
          router.push('/reports/day-book');
          closeMenu();
        } else if (key === 'g') {
          e.preventDefault();
          router.push('/reports/general-ledger');
          closeMenu();
        } else if (key === 'c') {
          e.preventDefault();
          router.push('/contacts?type=customer');
          closeMenu();
        } else if (key === 's') {
          e.preventDefault();
          router.push('/contacts?type=supplier');
          closeMenu();
        } else if (key === 'a') {
          e.preventDefault();
          setMenuState('ACCOUNT_BOOKS');
        }
      } 
      // Account Books Menu Shortcuts
      else if (menuState === 'ACCOUNT_BOOKS') {
        const key = e.key.toLowerCase();
        if (key === 'l') {
          e.preventDefault();
          setMenuState('LEDGERS');
        }
      }
      // Ledgers Menu Shortcuts
      else if (menuState === 'LEDGERS') {
        const key = e.key.toLowerCase();
        if (key === 'd') {
          e.preventDefault();
          router.push('/reports/day-book');
          closeMenu();
        } else if (key === 'g') {
          e.preventDefault();
          router.push('/reports/general-ledger');
          closeMenu();
        } else if (key === 'c') {
          e.preventDefault();
          router.push('/contacts?type=customer');
          closeMenu();
        } else if (key === 's') {
          e.preventDefault();
          router.push('/contacts?type=supplier');
          closeMenu();
        } else if (key === 'a') {
          e.preventDefault();
          router.push('/accounting/accounts');
          closeMenu();
        } else if (key === 'b') {
          e.preventDefault();
          router.push('/accounting/banking');
          closeMenu();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuState, router, closeMenu, profile]);

  return { menuState, closeMenu, setMenuState };
}