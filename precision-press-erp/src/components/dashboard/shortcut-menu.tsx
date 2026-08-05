'use client';

import React from 'react';
import { useGlobalShortcuts } from '@/hooks/use-global-shortcuts';
import { X, ChevronRight, FileText, Activity, BookOpen, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useCreateDrawer } from '@/components/dashboard/create-drawer';

export function ShortcutMenu() {
  const { menuState, closeMenu, setMenuState } = useGlobalShortcuts();
  const { open: openDrawer } = useCreateDrawer();
  const router = useRouter();

  // Prefetch routes in the background
  React.useEffect(() => {
    if (menuState !== null) {
      const routesToPrefetch = [
        '/sales/invoices/new', '/sales/quotes', '/sales/payments', 
        '/purchases/payments/new', '/accounting/banking', '/accounting/new', 
        '/reports', '/accounting/accounts'
      ];
      routesToPrefetch.forEach(route => router.prefetch(route));
    }
  }, [menuState, router]);

  if (menuState === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm transition-all p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
            {menuState === 'VOUCHERS' && <><FileText size={20} className="text-blue-600" /> <span>Vouchers Menu</span></>}
            {menuState === 'DISPLAY_REPORTS' && <><Activity size={20} className="text-blue-600" /> <span>Display Reports</span></>}
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
          
          {menuState === 'VOUCHERS' && (
            <div className="grid grid-cols-1 gap-2">
              <ShortcutItem hotkey="F4" label="Contra" onClick={() => { router.push('/accounting/banking'); closeMenu(); }} />
              <ShortcutItem hotkey="F5" label="Payment" onClick={() => { router.push('/purchases'); closeMenu(); }} />
              <ShortcutItem hotkey="F6" label="Receipt entry (sync) / gpay or cash" onClick={() => { openDrawer("customerCredit"); closeMenu(); }} />
              <ShortcutItem hotkey="F7" label="Journal" onClick={() => { router.push('/accounting'); closeMenu(); }} />
              <ShortcutItem hotkey="F8" label="Invoice" onClick={() => { openDrawer("invoice"); closeMenu(); }} />
              <ShortcutItem hotkey="F10" label="Quote" onClick={() => { window.location.href = 'http://localhost:3000/quotation-builder'; }} />
            </div>
          )}

          {menuState === 'DISPLAY_REPORTS' && (
            <div className="grid grid-cols-1 gap-2">
              <ShortcutItem hotkey="D" label="Day Book" onClick={() => {
                router.push('/reports/day-book');
                closeMenu();
              }} />
              <ShortcutItem hotkey="G" label="General Ledger" onClick={() => {
                router.push('/reports/general-ledger');
                closeMenu();
              }} />
              <ShortcutItem hotkey="C" label="Customer Ledger" onClick={() => {
                router.push('/contacts?type=customer');
                closeMenu();
              }} />
              <ShortcutItem hotkey="S" label="Supplier Ledger" onClick={() => {
                router.push('/contacts?type=supplier');
                closeMenu();
              }} />
              <ShortcutItem hotkey="A" label="Account Books" hasChildren onClick={() => setMenuState('ACCOUNT_BOOKS')} />
            </div>
          )}

          {menuState === 'ACCOUNT_BOOKS' && (
            <div className="grid grid-cols-1 gap-2">
              <ShortcutItem hotkey="L" label="Ledgers" hasChildren onClick={() => setMenuState('LEDGERS')} />
            </div>
          )}

          {menuState === 'LEDGERS' && (
            <div className="grid grid-cols-1 gap-2">
              <ShortcutItem hotkey="D" label="Day Book" onClick={() => { router.push('/reports/day-book'); closeMenu(); }} />
              <ShortcutItem hotkey="G" label="General Ledger" onClick={() => { router.push('/reports/general-ledger'); closeMenu(); }} />
              <ShortcutItem hotkey="C" label="Customer Ledger" onClick={() => { router.push('/contacts?type=customer'); closeMenu(); }} />
              <ShortcutItem hotkey="S" label="Supplier Ledger" onClick={() => { router.push('/contacts?type=supplier'); closeMenu(); }} />
              <ShortcutItem hotkey="A" label="Chart of Accounts" onClick={() => { router.push('/accounting/accounts'); closeMenu(); }} />
              <ShortcutItem hotkey="B" label="Bank Accounts" onClick={() => { router.push('/accounting/banking'); closeMenu(); }} />
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs font-medium text-slate-400 flex justify-between">
          <span>Press <kbd className="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-bold">Esc</kbd> to close</span>
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

function ShortcutItem({ hotkey, label, hasChildren, onClick }: { hotkey: string; label: string; hasChildren?: boolean; onClick?: () => void }) {
  return (
    <div 
      className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-blue-50 text-slate-700 transition-colors group cursor-pointer select-none active:scale-[0.99]"
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <span className="w-10 text-center font-bold font-mono text-xs bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700 px-2 py-1 rounded">
          {hotkey}
        </span>
        <span className="font-medium group-hover:text-blue-900">{label}</span>
      </div>
      {hasChildren && <ChevronRight size={16} className="text-slate-400 group-hover:text-blue-500" />}
    </div>
  );
}
