'use client';

import React from 'react';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useAuth } from '@/lib/auth-context';
import { X, ChevronRight, FileText, Activity, BookOpen, Layers, Sparkles, Landmark, Receipt, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCreateDrawer } from '@/components/dashboard/create-drawer';

interface ShortcutMenuProps {}

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

  // Prefetch routes in the background
  React.useEffect(() => {
    if (menuState !== null && profile && allowedRoles.includes(profile.role)) {
      const routesToPrefetch = [
        '/sales-register', '/quotation-register', '/receipt-register', 
        '/payment-entry', '/admin/treasury', '/admin/journal-transfers', 
        '/purchase', '/accountant/day-book', '/accountant/ledger', 
        '/accountant/bank-ledger', '/accountant/cash-ledger',
        '/accounting/contacts', '/accounting/sales', '/accounting/sales/customer-prepayments',
        '/accounting/banking', '/accounting/inventory'
      ];
      routesToPrefetch.forEach(route => router.prefetch(route));
    }
  }, [menuState, profile, router]);

  // Derive menu items for current menuState (standard submenus)
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

  // Keyboard navigation for standard submenus
  React.useEffect(() => {
    if (menuState === null || menuState === 'ALL_SHORTCUTS' || currentItems.length === 0) return;

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

  // Keypress listener for S, R, B, I and close keys when ALL_SHORTCUTS window is open
  React.useEffect(() => {
    if (menuState !== 'ALL_SHORTCUTS') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        router.push('/accounting/sales');
        closeMenu();
      } else if (key === 'r') {
        e.preventDefault();
        router.push('/accounting/sales/customer-prepayments');
        closeMenu();
      } else if (key === 'b') {
        e.preventDefault();
        router.push('/accounting/banking');
        closeMenu();
      } else if (key === 'i') {
        e.preventDefault();
        router.push('/accounting/inventory');
        closeMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuState, router, closeMenu]);

  if (!profile || !allowedRoles.includes(profile.role)) {
    return null;
  }

  if (menuState === null) {
    return null;
  }

  const isAllShortcuts = menuState === 'ALL_SHORTCUTS';

  return (
    <div data-shortcut-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-md transition-all p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 ${isAllShortcuts ? 'max-w-4xl' : 'max-w-lg'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            {menuState === 'ALL_SHORTCUTS' && (
              <>
                <Sparkles size={20} className="text-blue-600 animate-pulse" />
                <span className="text-base">Keyboard Shortcuts & Quick Registers</span>
                <span className="ml-2 text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">Alt + S</span>
              </>
            )}
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
        {isAllShortcuts ? (
          <div className="p-6 bg-white space-y-6 max-h-[78vh] overflow-y-auto">
            {/* Section 1: Main Registers & Direct Links */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="size-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Quick Registers & Direct Links</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => { router.push('/accounting/sales'); closeMenu(); }}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/60 hover:border-emerald-300 transition-all text-left group shadow-2xs cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold shrink-0">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-700">Sales Register</p>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-300 rounded shadow-2xs">S</kbd>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Invoices & sales status</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => { router.push('/accounting/sales/customer-prepayments'); closeMenu(); }}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/60 hover:border-blue-300 transition-all text-left group shadow-2xs cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold shrink-0">
                      <Receipt size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700">Receipt Register</p>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold font-mono bg-blue-100 text-blue-800 border border-blue-300 rounded shadow-2xs">R</kbd>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Customer prepayments</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-blue-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => { router.push('/accounting/banking'); closeMenu(); }}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-100/60 hover:border-purple-300 transition-all text-left group shadow-2xs cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700 font-bold shrink-0">
                      <Landmark size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-purple-700">Bank Accounts</p>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold font-mono bg-purple-100 text-purple-800 border border-purple-300 rounded shadow-2xs">B</kbd>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Bank ledgers & transfers</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-purple-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => { router.push('/accounting/inventory'); closeMenu(); }}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/60 hover:border-amber-300 transition-all text-left group shadow-2xs cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 font-bold shrink-0">
                      <Package size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-amber-700">Inventory Stock</p>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold font-mono bg-amber-100 text-amber-800 border border-amber-300 rounded shadow-2xs">I</kbd>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Stock items & catalogue</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-amber-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              </div>
            </div>

            {/* Section 2: Global Navigation Hotkeys */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="size-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Global Navigation Hotkeys</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div onClick={() => { router.push('/admin/orders'); closeMenu(); }} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-800">Global Orders / Command Center</span>
                  <kbd className="px-2 py-1 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded-md shadow-2xs text-slate-700">G</kbd>
                </div>
                <div onClick={() => { router.push('/proxy-order'); closeMenu(); }} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-800">Proxy Order Builder</span>
                  <kbd className="px-2 py-1 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded-md shadow-2xs text-slate-700">N</kbd>
                </div>
                <div onClick={() => { router.push('/accounting'); closeMenu(); }} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-800">Accounting Command Center</span>
                  <kbd className="px-2 py-1 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded-md shadow-2xs text-slate-700">Z</kbd>
                </div>
                <div onClick={() => { setMenuState('VOUCHERS'); }} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-800">Vouchers Quick Menu</span>
                  <kbd className="px-2 py-1 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded-md shadow-2xs text-slate-700">V</kbd>
                </div>
                <div onClick={() => { setMenuState('DISPLAY_REPORTS'); }} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-800">Display Reports</span>
                  <kbd className="px-2 py-1 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded-md shadow-2xs text-slate-700">D</kbd>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                  <span className="text-xs font-semibold text-slate-800">Period / Date Filter Modal</span>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 text-xs font-bold font-mono bg-amber-100 border border-amber-300 rounded text-amber-900">F2</kbd>
                    <span className="text-xs text-slate-400">or</span>
                    <kbd className="px-1.5 py-0.5 text-xs font-bold font-mono bg-amber-100 border border-amber-300 rounded text-amber-900">F</kbd>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Voucher Action Shortcuts */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="size-4 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Voucher Creation Hotkeys</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div onClick={() => { router.push('/accounting/sales/new'); closeMenu(); }} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-700">Invoice</span>
                  <kbd className="px-1.5 py-0.5 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded">F8</kbd>
                </div>
                <div onClick={() => { router.push('/quotation-builder'); closeMenu(); }} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-700">Quote / Estimate</span>
                  <kbd className="px-1.5 py-0.5 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded">F10</kbd>
                </div>
                <div onClick={() => { router.push('/accounting/receipt/new'); closeMenu(); }} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-700">Receipt</span>
                  <kbd className="px-1.5 py-0.5 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded">F6</kbd>
                </div>
                <div onClick={() => { router.push('/purchases'); closeMenu(); }} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-700">Payment / Purchase</span>
                  <kbd className="px-1.5 py-0.5 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded">F5</kbd>
                </div>
                <div onClick={() => { router.push('/accounting/contra'); closeMenu(); }} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-700">Contra</span>
                  <kbd className="px-1.5 py-0.5 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded">F4</kbd>
                </div>
                <div onClick={() => { router.push('/accounting/journal'); closeMenu(); }} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                  <span className="text-xs font-semibold text-slate-700">Journal</span>
                  <kbd className="px-1.5 py-0.5 text-xs font-bold font-mono bg-slate-100 border border-slate-300 rounded">F7</kbd>
                </div>
              </div>
            </div>
          </div>
        ) : (
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
        )}

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs font-medium text-slate-400 flex justify-between">
          <span className="flex items-center gap-1.5">
            <span>Press <kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-600 font-bold">Alt + S</kbd> anytime to toggle</span>
            <span>· Press <kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-600 font-bold">Esc</kbd> or <kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-600 font-bold">Backspace</kbd> to close</span>
          </span>
          {(menuState === 'ACCOUNT_BOOKS' || menuState === 'LEDGERS') && (
            <button 
              onClick={() => {
                if (menuState === 'ACCOUNT_BOOKS') setMenuState('DISPLAY_REPORTS');
                if (menuState === 'LEDGERS') setMenuState('ACCOUNT_BOOKS');
              }}
              className="text-blue-500 hover:text-blue-700 font-semibold"
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
