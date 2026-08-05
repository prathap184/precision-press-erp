'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export type MenuState = null | 'VOUCHERS' | 'DISPLAY_REPORTS' | 'ACCOUNT_BOOKS' | 'LEDGERS';

export function useGlobalShortcuts() {
  const [menuState, setMenuState] = useState<MenuState>(null);
  const router = useRouter();

  const closeMenu = useCallback(() => setMenuState(null), []);

  useEffect(() => {
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

      // Close menu on Escape, or go back if menu is already closed
      if (e.key === 'Escape') {
        if (menuState !== null) {
          closeMenu();
        } else {
          router.back();
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
          router.push('/sales/invoices/new');
        } else if (key === 'g') {
          e.preventDefault();
          window.location.href = `${process.env.NEXT_PUBLIC_PIXEL_MARKETING_URL || 'http://localhost:3000'}/admin/orders`;
        } else if (key === 'z') {
          e.preventDefault();
          router.push('/dashboard');
        } else if (key === 'c') {
          e.preventDefault();
          router.push('/sales/receipts');
        }
      } 
      // Vouchers Menu Shortcuts
      else if (menuState === 'VOUCHERS') {
        const isFunctionKey = /^F(4|5|6|7|8|9|10)$/.test(e.key);
        if (isFunctionKey) {
          e.preventDefault();
          if (e.key === 'F4') {
            router.push('/accounting/banking');
          } else if (e.key === 'F5') {
            router.push('/purchases');
          } else if (e.key === 'F6') {
            router.push('/sales/customer-prepayments');
          } else if (e.key === 'F7') {
            router.push('/accounting');
          } else if (e.key === 'F8') {
            router.push('/sales');
          } else if (e.key === 'F10') {
            window.location.href = 'http://localhost:3000/quotation-builder';
          }
          closeMenu();
        }
      } 
      // Display Reports Menu Shortcuts
      else if (menuState === 'DISPLAY_REPORTS') {
        const key = e.key.toLowerCase();
        if (key === 'd') {
          e.preventDefault();
          router.push('/reports');
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
          router.push('/reports');
          closeMenu();
        } else if (key === 'a' || key === 'b' || key === 'c' || key === 'u') {
          e.preventDefault();
          router.push('/accounting/accounts');
          closeMenu();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuState, router, closeMenu]);

  return { menuState, closeMenu, setMenuState };
}
