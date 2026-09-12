'use client';

import React from 'react';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useAuth } from '@/lib/auth-context';
import { X, ChevronRight, FileText, Activity, BookOpen, Layers } from 'lucide-react';
import Link from 'next/link';

interface ShortcutMenuProps {
  // Can be used to pass user role if needed, though role is checked before rendering this component
}

import { useRouter } from 'next/navigation';

import { useCreateDrawer } from '@/components/dashboard/create-drawer';

interface ShortcutItemDef {
  hotkey: string;
  label: string;
  hasChildren?: boolean;
  onClick: () => void;
}

export function ShortcutMenu({}: ShortcutMenuProps) {
  const { menuState, closeMenu, setMenuState } = useGlobalShortcuts();
  const { open: openDrawer } = useCreateDrawer();
  const { profile } = useAuth();
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = React.useState<number>(0);

  const allowedRoles = ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'ACDEMA'];

  // Prefetch routes in the background so they load instantly when a shortcut is pressed
  React.useEffect(() => {
    if (menuState !== null && profile && allowedRoles.includes(profile.role)) {
      const routesToPrefetch = [
        '/sales-register', '/quotation-register', '/receipt-register', 
        '/payment-entry', '/admin/treasury', '/admin/journal-transfers', 
        '/purchase', '/accountant/day-book', '/accountant/ledger', 
        '/accountant/bank-ledger', '/accountant/cash-ledger',
        '/accounting/contacts'
      ];
      routesToPrefetch.forEach(route => router.prefetch(route));
    }
  }, [menuState, profile, router]);

  // Derive menu items for current menuState
  const currentItems: ShortcutItemDef[] = React.useMemo(() => {
    if (menuState === 'VOUCHERS') {
      return [
        { hotkey: 'F8', label: 'Invoice', onClick: () => { router.push('/accounting/sales/new'); closeMenu(); } },
        { hotkey: 'F10', label: 'Quote', onClick: () => { router.push('/quotation-builder'); closeMenu(); } },
        { hotkey: 'F6', label: 'Receipt entry (sync) / gpay or cash', onClick: () => { router.push('/accounting/receipt/new'); closeMenu(); } },
        { hotkey: 'F5', label: 'Payment', onClick: () => { router.push('/purchases'); closeMenu(); } },
        { hotkey: 'F4', label: 'Contra', onClick: () => { router.push('/accounting/contra'); closeMenu(); } },
        { hotkey: 'F7', label: 'Journal', onClick: () => { router.push('/accounting/journal'); closeMenu(); } },
      ];
    }
    if (menuState === 'DISPLAY_REPORTS') {
      return [
        { hotkey: 'D', label: 'Day Book', onClick: () => { router.push('/reports/day-book'); closeMenu(); } },
        { hotkey: 'A', label: 'Account Books', hasChildren: true, onClick: () => setMenuState('ACCOUNT_BOOKS') },
      ];
    }
    if (menuState === 'ACCOUNT_BOOKS') {
      return [
        { hotkey: 'L', label: 'Ledgers', hasChildren: true, onClick: () => setMenuState('LEDGERS') },
      ];
    }
    if (menuState === 'LEDGERS') {
      return [
        { hotkey: 'D', label: 'Day Book', onClick: () => { router.push('/reports/day-book'); closeMenu(); } },
        { hotkey: 'G', label: 'General Ledger', onClick: () => { router.push('/reports/general-ledger'); closeMenu(); } },
        { hotkey: 'C', label: 'Customer Ledger', onClick: () => { router.push('/accounting/contacts?type=customer&focus=search'); closeMenu(); } },
        { hotkey: 'S', label: 'Supplier Ledger', onClick: () => { router.push('/accounting/contacts?type=supplier&focus=search'); closeMenu(); } },
        { hotkey: 'A', label: 'Chart of Accounts', onClick: () => { router.push('/accounting/accounts'); closeMenu(); } },
        { hotkey: 'B', label: 'Bank Accounts', onClick: () => { router.push('/accounting/banking'); closeMenu(); } },
      ];
    }
    return [];
  }, [menuState, openDrawer, closeMenu, router, setMenuState]);

  // Reset selectedIndex whenever menuState changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [menuState]);

  // Keyboard navigation for ArrowUp, ArrowDown, and Enter
  React.useEffect(() => {
    if (menuState === null || currentItems.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % currentItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + currentItems.length) % currentItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = currentItems[selectedIndex];
        if (item && item.onClick) {
          item.onClick();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuState, currentItems, selectedIndex]);

  if (!profile || !allowedRoles.includes(profile.role)) {
    return null;
  }

  if (menuState === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-all p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            {menuState === 'VOUCHERS' && <><FileText size={20} className="text-blue-600" /> <span>Vouchers Menu</span></>}
            {menuState === 'DISPLAY_REPORTS' && <><Activity size={20} className="text-blue-600" /> <span>Display Reports</span></>}
            {menuState === 'DAY_REPORT' && <><BookOpen size={20} className="text-blue-600" /> <span>Day Report</span></>}
            {menuState === 'ACCOUNT_BOOKS' && <><Layers size={20} className="text-blue-600" /> <span>Account Books</span></>}
            {menuState === 'LEDGERS' && <><FileText size={20} className="text-blue-600" /> <span>Ledgers</span></>}
          </div>
          <button 
            onClick={closeMenu}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 bg-white min-h-[300px]">
          <div className="grid grid-cols-1 gap-2">
            {currentItems.map((item, idx) => (
              <ShortcutItem
                key={`${item.hotkey}-${item.label}`}
                hotkey={item.hotkey}
                label={item.label}
                hasChildren={item.hasChildren}
                isSelected={idx === selectedIndex}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={item.onClick}
              />
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs font-medium text-slate-400 flex justify-between">
          <span className="flex items-center gap-1.5">
            <span>Navigate <kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-500">↑</kbd><kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-500">↓</kbd></span>
            <span>Select <kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-500">Enter</kbd></span>
            <span>or press key</span>
          </span>
          {(menuState === 'ACCOUNT_BOOKS' || menuState === 'LEDGERS') && (
            <button 
              onClick={() => {
                if (menuState === 'ACCOUNT_BOOKS') setMenuState('DISPLAY_REPORTS');
                if (menuState === 'LEDGERS') setMenuState('ACCOUNT_BOOKS');
              }}
              className="text-blue-500 hover:text-blue-700"
            >
              &larr; Go Back
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

function ShortcutItem({ 
  hotkey, 
  label, 
  hasChildren, 
  isSelected, 
  onMouseEnter, 
  onClick 
}: { 
  hotkey: string; 
  label: string; 
  hasChildren?: boolean; 
  isSelected?: boolean; 
  onMouseEnter?: () => void; 
  onClick?: () => void; 
}) {
  return (
    <div 
      className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all cursor-pointer select-none border ${
        isSelected
          ? 'bg-blue-600 text-white font-semibold border-blue-600 shadow-md ring-2 ring-blue-400/30'
          : 'bg-white hover:bg-blue-50 text-slate-700 border-transparent'
      }`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <span className={`w-10 text-center font-bold font-mono text-xs px-2 py-1 rounded transition-colors ${
          isSelected
            ? 'bg-white/20 text-white'
            : 'bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700'
        }`}>
          {hotkey}
        </span>
        <span className={isSelected ? 'text-white' : 'font-medium text-slate-800'}>{label}</span>
      </div>
      {hasChildren && (
        <ChevronRight size={16} className={isSelected ? 'text-white' : 'text-slate-400'} />
      )}
    </div>
  );
}
