'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, RefreshCw, Users, Building2, Landmark, Wallet,
  CircleDollarSign, CheckCircle2, XCircle, ArrowRightCircle, LayoutList
} from 'lucide-react';

interface TallyLedger {
  name:           string;
  parent:         string;
  gstin:          string;
  state:          string;
  openingBalance: string;
  closingBalance: string;
}

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

interface LedgerRow extends TallyLedger {
  syncStatus: SyncStatus;
  syncTable?: string;
  syncType?: string;
  syncError?: string;
}

function getCategory(parent: string) {
  const p = (parent || '').replace(/&amp;/g, '&');
  if (p === 'Sundry Debtors')   return 'customer';
  if (p === 'Sundry Creditors') return 'supplier';
  if (p === 'Bank Accounts')    return 'bank';
  if (p === 'Cash-in-Hand')     return 'cash';
  const lp = p.toLowerCase();
  if (lp.includes('tax') || lp.includes('duties')) return 'tax';
  return 'other';
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { label: string; className: string }> = {
    customer: { label: 'Customer',  className: 'border-blue-300   text-blue-700   bg-blue-50'   },
    supplier: { label: 'Supplier',  className: 'border-orange-300 text-orange-700 bg-orange-50' },
    bank:     { label: 'Bank',      className: 'border-purple-300 text-purple-700 bg-purple-50' },
    cash:     { label: 'Cash',      className: 'border-amber-300  text-amber-700  bg-amber-50'  },
    tax:      { label: 'Tax/Duty',  className: 'border-rose-300   text-rose-700   bg-rose-50'   },
    other:    { label: 'Other',     className: 'border-slate-300  text-slate-600  bg-slate-50'  },
  };
  const cfg = map[category] || map.other;
  return (
    <Badge variant="outline" className={`text-xs shrink-0 ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

function TableBadge({ table }: { table?: string }) {
  if (!table) return null;
  const label = table === 'bank_account_tally' ? 'bank_account_tally' : 'contact_tally';
  return (
    <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
      → {label}
    </span>
  );
}

export default function TallyMastersReviewPage() {
  const [loading,  setLoading]  = useState(true);
  const [ledgers,  setLedgers]  = useState<LedgerRow[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');

  // ── Load from tally_sync_queue on mount ──────────────────────────────────
  const loadFromQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tally-sync/queue-ledgers?_t=${Date.now()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load');
      setLedgers((data.ledgers || []).map((l: TallyLedger) => ({
        ...l,
        syncStatus: 'idle',
      })));
      setFetchedAt(data.fetchedAt);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFromQueue(); }, [loadFromQueue]);

  // ── Sync a single ledger ─────────────────────────────────────────────────
  async function syncLedger(name: string) {
    setLedgers(prev => prev.map(l =>
      l.name === name ? { ...l, syncStatus: 'syncing', syncError: undefined } : l
    ));

    const ledger = ledgers.find(l => l.name === name);
    try {
      const res = await fetch('/api/v1/tally-sync/sync-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledger }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      setLedgers(prev => prev.map(l =>
        l.name === name
          ? { ...l, syncStatus: 'done', syncTable: result.table, syncType: result.type }
          : l
      ));
    } catch (e: any) {
      setLedgers(prev => prev.map(l =>
        l.name === name ? { ...l, syncStatus: 'error', syncError: e.message } : l
      ));
    }
  }

  // ── Sync all in current tab ───────────────────────────────────────────────
  async function syncAll() {
    const toSync = filtered.filter(l => l.syncStatus === 'idle' || l.syncStatus === 'error');
    for (const l of toSync) {
      await syncLedger(l.name);
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────
  const categories = ['all','customer','supplier','bank','cash','tax','other'];
  const filtered = activeTab === 'all'
    ? ledgers
    : ledgers.filter(l => getCategory(l.parent) === activeTab);

  const counts = {
    all:      ledgers.length,
    customer: ledgers.filter(l => getCategory(l.parent) === 'customer').length,
    supplier: ledgers.filter(l => getCategory(l.parent) === 'supplier').length,
    bank:     ledgers.filter(l => getCategory(l.parent) === 'bank').length,
    cash:     ledgers.filter(l => getCategory(l.parent) === 'cash').length,
    tax:      ledgers.filter(l => getCategory(l.parent) === 'tax').length,
    other:    ledgers.filter(l => getCategory(l.parent) === 'other').length,
  };

  const doneCount  = ledgers.filter(l => l.syncStatus === 'done').length;
  const errorCount = ledgers.filter(l => l.syncStatus === 'error').length;

  const tabIcons: Record<string, React.ReactNode> = {
    all:      <LayoutList className="w-3.5 h-3.5" />,
    customer: <Users       className="w-3.5 h-3.5" />,
    supplier: <Building2   className="w-3.5 h-3.5" />,
    bank:     <Landmark    className="w-3.5 h-3.5" />,
    cash:     <Wallet      className="w-3.5 h-3.5" />,
    tax:      <CircleDollarSign className="w-3.5 h-3.5" />,
    other:    <LayoutList  className="w-3.5 h-3.5" />,
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
      <p className="text-slate-500 font-medium">Loading ledgers from Tally queue...</p>
    </div>
  );

  if (error) return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-red-600">
        <p className="font-bold mb-1">Failed to load</p>
        <p className="text-sm">{error}</p>
        <Button size="sm" className="mt-3" onClick={loadFromQueue}>Retry</Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Review Tally Masters
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {ledgers.length} ledgers loaded from Tally.
            {fetchedAt && <span className="ml-2 text-slate-400">Last pulled: {new Date(fetchedAt).toLocaleString('en-IN')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {doneCount > 0 && (
            <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> {doneCount} synced
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-sm text-red-500 font-semibold flex items-center gap-1">
              <XCircle className="w-4 h-4" /> {errorCount} failed
            </span>
          )}
          <Button variant="outline" size="sm" onClick={loadFromQueue}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={syncAll}
            disabled={filtered.every(l => l.syncStatus === 'done' || l.syncStatus === 'syncing')}
          >
            <ArrowRightCircle className="w-4 h-4 mr-2" />
            Sync All ({activeTab === 'all' ? 'All' : activeTab})
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`rounded-xl border p-3 text-left transition-all ${
              activeTab === cat
                ? 'border-blue-400 bg-blue-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-xl font-black text-slate-900">{counts[cat as keyof typeof counts]}</p>
            <p className="text-xs text-slate-500 capitalize mt-0.5">{cat === 'all' ? 'All Ledgers' : cat + 's'}</p>
          </button>
        ))}
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <CardTitle className="text-base flex items-center gap-2">
            {tabIcons[activeTab]}
            <span className="capitalize">{activeTab === 'all' ? 'All Ledgers' : activeTab + 's'}</span>
            <Badge variant="secondary" className="ml-auto font-mono">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No ledgers in this category</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {filtered.map((l) => {
                const cat = getCategory(l.parent);
                return (
                  <div
                    key={l.name}
                    className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors ${
                      l.syncStatus === 'done'  ? 'bg-emerald-50/40' :
                      l.syncStatus === 'error' ? 'bg-red-50/40' : ''
                    }`}
                  >
                    {/* Name & details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">{l.name}</p>
                        <CategoryBadge category={cat} />
                        {l.syncStatus === 'done' && <TableBadge table={l.syncTable} />}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Group: <span className="text-slate-600">{l.parent || '—'}</span>
                        {l.gstin && <span className="ml-3 font-mono">GST: {l.gstin}</span>}
                        {l.state && <span className="ml-3">{l.state}</span>}
                      </p>
                      {l.syncStatus === 'error' && (
                        <p className="text-xs text-red-500 mt-0.5">⚠ {l.syncError}</p>
                      )}
                    </div>

                    {/* Balances */}
                    <div className="flex gap-6 shrink-0 hidden md:flex">
                      <div className="text-right">
                        <p className="text-xs text-slate-400 uppercase font-semibold">Opening</p>
                        <p className="text-sm font-mono text-slate-700">
                          ₹{Math.abs(parseFloat((l.openingBalance || '0').replace(/,/g, '')) || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div className="text-right w-24">
                        <p className="text-xs text-slate-400 uppercase font-semibold">Closing</p>
                        <p className="text-sm font-mono text-slate-900 font-bold">
                          ₹{Math.abs(parseFloat((l.closingBalance || '0').replace(/,/g, '')) || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    {/* Sync button */}
                    <div className="shrink-0">
                      {l.syncStatus === 'syncing' ? (
                        <Button size="sm" disabled className="w-28">
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Syncing...
                        </Button>
                      ) : l.syncStatus === 'done' ? (
                        <Button size="sm" variant="outline" disabled className="w-28 text-emerald-600 border-emerald-300 bg-emerald-50">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Synced
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`w-28 ${l.syncStatus === 'error' ? 'border-red-300 text-red-600 hover:bg-red-50' : 'hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'}`}
                          onClick={() => syncLedger(l.name)}
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5 mr-1.5" />
                          {l.syncStatus === 'error' ? 'Retry' : 'Sync'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
