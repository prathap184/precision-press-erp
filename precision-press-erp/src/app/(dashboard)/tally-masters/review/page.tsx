'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Loader2, Download, Building2, Users,
  Landmark, RefreshCw, FileCheck2, DatabaseZap
} from 'lucide-react';

interface TallyLedger {
  id:             string;
  name:           string;
  parent:         string;
  openingBalance: string;
  closingBalance: string;
  gstin:          string;
  state:          string;
  type?:          string;
}

function formatINR(val: string | number) {
  const n = Math.abs(parseFloat(String(val)) || 0);
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TallyMastersReviewPage() {
  const router   = useRouter();

  const [stage,    setStage]    = useState<'connect' | 'polling' | 'review'>('connect');
  const [syncing,  setSyncing]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [contacts, setContacts] = useState<TallyLedger[]>([]);
  const [banks,    setBanks]    = useState<TallyLedger[]>([]);
  const [accounts, setAccounts] = useState<TallyLedger[]>([]);

  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedBanks,    setSelectedBanks]    = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  const [cutoverDate, setCutoverDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  );
  
  const [eventId, setEventId] = useState<string | null>(null);

  // ─── 1. Trigger Fetch from Tally ───────────────────────────────────────────
  async function handlePullFromTally() {
    const orgId = localStorage.getItem('activeOrgId') || '';
    if (!orgId) {
      alert('No active organization found. Please log in again.');
      return;
    }

    setStage('polling');
    setError(null);

    try {
      const res = await fetch('/api/v1/tally-sync/trigger-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });
      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setEventId(result.eventId);
    } catch (err: any) {
      setError(err.message);
      setStage('connect');
    }
  }

  // ─── 2. Poll for Status ───────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'polling' || !eventId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/tally-sync/poll-fetch?eventId=${eventId}`);
        const result = await res.json();

        if (result.status === 'SUCCESS') {
          clearInterval(interval);
          fetchStagedData();
        } else if (result.status === 'FAILED') {
          clearInterval(interval);
          setError(result.error || 'Sync failed in connector');
          setStage('connect');
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [stage, eventId]);

  // ─── 3. Fetch Staged Data ─────────────────────────────────────────────────
  async function fetchStagedData() {
    const orgId = localStorage.getItem('activeOrgId') || '';
    try {
      const res = await fetch(`/api/v1/tally-sync/staging?organizationId=${orgId}`);
      const result = await res.json();

      if (result.success) {
        setContacts(result.contacts);
        setBanks(result.banks);
        setAccounts(result.accounts);

        setSelectedContacts(result.contacts.map((c: TallyLedger) => c.id));
        setSelectedBanks(result.banks.map((b: TallyLedger) => b.id));
        setSelectedAccounts(result.accounts.map((a: TallyLedger) => a.id));

        setStage('review');
      } else {
        setError(result.error);
        setStage('connect');
      }
    } catch (err: any) {
      setError(err.message);
      setStage('connect');
    }
  }

  // ─── 4. Push to ERP Database ──────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    try {
      const orgId = localStorage.getItem('activeOrgId') || '';
      
      const payload = {
        contactIds: selectedContacts,
        bankIds: selectedBanks,
        accountIds: selectedAccounts,
        organizationId: orgId,
        cutoverDate,
      };

      const res = await fetch('/api/v1/tally-sync/import-erp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.success) {
        alert(`✅ Successfully imported ${result.count} records into the ERP! Opening balance invoices have been generated.`);
        router.push('/tally-masters');
      } else {
        alert('❌ Sync failed: ' + result.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSyncing(false);
    }
  }

  const totalSelected = selectedContacts.length + selectedBanks.length + selectedAccounts.length;
  const totalFound    = contacts.length + banks.length + accounts.length;

  // ─── CONNECT SCREEN ────────────────────────────────────────────────────────
  if (stage === 'connect' || stage === 'polling') {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Sync Masters from Tally
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Make sure your TallyPrime is running and the Local Connector is active on your PC.
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        <Card>
          <CardContent className="flex flex-col items-center py-16 gap-6">
            {stage === 'polling' ? (
              <>
                <Loader2 className="h-14 w-14 text-emerald-500 animate-spin" />
                <div className="text-center">
                  <p className="font-semibold text-slate-700 text-lg">Communicating with Tally...</p>
                  <p className="text-sm text-slate-400 mt-1">The connector is fetching your Customers, Suppliers, and Accounts.</p>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 bg-blue-50 rounded-full">
                  <DatabaseZap className="h-10 w-10 text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-700 text-xl">Ready to Pull</p>
                  <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                    Click the button below to request the latest master data directly from your Tally software. No manual upload needed.
                  </p>
                </div>
                <Button onClick={handlePullFromTally} size="lg" className="bg-blue-600 hover:bg-blue-700">
                  <Download className="mr-2 h-5 w-5" />
                  Pull Customers / Suppliers from Tally
                </Button>
                
                <Button variant="link" className="text-slate-400" onClick={fetchStagedData}>
                  View existing staged data
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── REVIEW SCREEN ─────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <FileCheck2 className="h-5 w-5 text-emerald-600" />
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Review Tally Masters</h1>
          </div>
          <p className="text-slate-500 text-sm">
            {totalFound} ledgers found from Tally. Select the records you want to push to the live database.
          </p>
        </div>

        <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Opening Balance Date
            </label>
            <Input
              type="date"
              value={cutoverDate}
              onChange={e => setCutoverDate(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <Button
            onClick={handleSync}
            disabled={totalSelected === 0 || syncing}
            className="bg-emerald-600 hover:bg-emerald-700 h-9 px-5"
          >
            {syncing
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <DatabaseZap className="w-4 h-4 mr-2" />}
            Push to Database
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-9"
            onClick={() => { setStage('connect'); setError(null); }}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Users,    label: 'Customers & Suppliers', count: contacts.length, color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { icon: Landmark, label: 'Bank / Cash Accounts',  count: banks.length,    color: 'text-purple-600', bg: 'bg-purple-50' },
          { icon: Building2,label: 'Chart of Accounts',     count: accounts.length, color: 'text-amber-600',  bg: 'bg-amber-50'  },
        ].map(({ icon: Icon, label, count, color, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="pt-5 pb-4 flex items-center gap-4">
              <div className={`${bg} ${color} rounded-xl p-3`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900">{count}</p>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="contacts">
        <TabsList className="mb-4 bg-slate-100">
          <TabsTrigger value="contacts">
            Customers &amp; Suppliers
            <Badge variant="secondary" className="ml-2 bg-white">{contacts.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="banks">
            Bank / Cash
            <Badge variant="secondary" className="ml-2 bg-white">{banks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="accounts">
            Chart of Accounts
            <Badge variant="secondary" className="ml-2 bg-white">{accounts.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── CONTACTS ── */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Customers &amp; Suppliers</CardTitle>
                <CardDescription>Select records to create live contacts + opening balance invoices.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedContacts(contacts.map(c => c.id))}>All</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedContacts([])}>None</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {contacts.map(c => {
                  const bal        = parseFloat(c.closingBalance);
                  const isSelected = selectedContacts.includes(c.id);
                  const isCustomer = c.type === 'customer';
                  const balColor   = bal > 0 ? (isCustomer ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400';
                  return (
                    <div
                      key={c.id}
                      className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/40' : ''}`}
                      onClick={() => setSelectedContacts(prev =>
                        prev.includes(c.id) ? prev.filter(n => n !== c.id) : [...prev, c.id]
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={checked =>
                          setSelectedContacts(prev => checked ? [...prev, c.id] : prev.filter(n => n !== c.id))
                        }
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                          <Badge
                            variant="outline"
                            className={`capitalize text-xs shrink-0 ${isCustomer ? 'border-blue-300 text-blue-700' : 'border-orange-300 text-orange-700'}`}
                          >
                            {isCustomer ? 'Customer' : 'Supplier'}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Group: {c.parent}
                          {c.gstin && <span className="ml-3 font-mono">GSTIN: {c.gstin}</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Opening Balance</p>
                        <p className={`font-mono font-bold text-base ${balColor}`}>{formatINR(c.closingBalance)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BANKS ── */}
        <TabsContent value="banks">
          <Card>
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Bank &amp; Cash Accounts</CardTitle>
                <CardDescription>Will be created in your ERP Chart of Accounts.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedBanks(banks.map(b => b.id))}>All</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedBanks([])}>None</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {banks.map(b => {
                  const bal        = parseFloat(b.closingBalance);
                  const isSelected = selectedBanks.includes(b.id);
                  const isCash     = b.name.toLowerCase().includes('cash');
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50/40' : ''}`}
                      onClick={() => setSelectedBanks(prev =>
                        prev.includes(b.id) ? prev.filter(n => n !== b.id) : [...prev, b.id]
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={checked =>
                          setSelectedBanks(prev => checked ? [...prev, b.id] : prev.filter(n => n !== b.id))
                        }
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Landmark className={`w-4 h-4 shrink-0 ${isCash ? 'text-amber-500' : 'text-purple-500'}`} />
                          <p className="font-semibold text-slate-900">{b.name}</p>
                          <Badge
                            variant="outline"
                            className={`text-xs ${isCash ? 'border-amber-300 text-amber-700' : 'border-purple-300 text-purple-700'}`}
                          >
                            {isCash ? 'Cash / Wallet' : 'Bank'}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Tally Group: {b.parent}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Opening Balance</p>
                        <p className={`font-mono font-bold text-base ${bal > 0 ? (isCash ? 'text-amber-700' : 'text-purple-700') : 'text-slate-400'}`}>
                          {formatINR(b.closingBalance)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CHART OF ACCOUNTS ── */}
        <TabsContent value="accounts">
          <Card>
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Chart of Accounts</CardTitle>
                <CardDescription>All other ledgers — expenses, income, duties, etc.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelectedAccounts(accounts.map(a => a.id))}>All</Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedAccounts([])}>None</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {accounts.map(a => {
                  const isSelected = selectedAccounts.includes(a.id);
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-amber-50/40' : ''}`}
                      onClick={() => setSelectedAccounts(prev =>
                        prev.includes(a.id) ? prev.filter(n => n !== a.id) : [...prev, a.id]
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={checked =>
                          setSelectedAccounts(prev => checked ? [...prev, a.id] : prev.filter(n => n !== a.id))
                        }
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{a.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">Group: {a.parent}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
