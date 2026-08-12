'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTallyMastersFromFiles, TallyLedger } from '@/lib/actions/tally-xml-parser';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, Download, AlertCircle, Building2, Users, Landmark, RefreshCw } from 'lucide-react';

function formatINR(val: string | number) {
  const n = Math.abs(parseFloat(String(val)) || 0);
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TallyMastersReviewPage() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [contacts, setContacts] = useState<TallyLedger[]>([]);
  const [banks, setBanks]       = useState<TallyLedger[]>([]);
  const [accounts, setAccounts] = useState<TallyLedger[]>([]);

  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedBanks, setSelectedBanks]       = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  const [cutoverDate, setCutoverDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const result = await getTallyMastersFromFiles();
      if (result.error) { setError(result.error); return; }

      setContacts(result.contacts);
      setBanks(result.banks);
      setAccounts(result.accounts);

      // auto-select all
      setSelectedContacts(result.contacts.map(c => c.name));
      setSelectedBanks(result.banks.map(b => b.name));
      setSelectedAccounts(result.accounts.map(a => a.name));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const totalSelected = selectedContacts.length + selectedBanks.length + selectedAccounts.length;

  async function handleSync() {
    setSyncing(true);
    try {
      const orgId = typeof window !== 'undefined'
        ? (localStorage.getItem('activeOrgId') || '')
        : '';

      if (!orgId) {
        alert('No active organization found. Please log in again.');
        setSyncing(false);
        return;
      }

      const payload = {
        contacts:      contacts.filter(c => selectedContacts.includes(c.name)),
        banks:         banks.filter(b => selectedBanks.includes(b.name)),
        accounts:      accounts.filter(a => selectedAccounts.includes(a.name)),
        organizationId: orgId,
        cutoverDate,
      };

      const res = await fetch('/api/v1/tally-sync/import-json', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.success) {
        alert(`✅ Successfully imported ${result.count} records into the ERP!`);
        router.push('/tally-masters');
      } else {
        alert('❌ Sync failed: ' + result.error);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Reading Tally export files…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex flex-col items-center py-12 gap-4">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <h3 className="font-bold text-lg text-red-800">Could not read Tally export files</h3>
            <p className="text-red-700 text-sm text-center">{error}</p>
            <div className="bg-white border border-red-200 rounded-lg p-4 text-sm text-slate-700 w-full">
              <p className="font-semibold mb-2">How to fix:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Open Tally Prime → Gateway of Tally → Display More Reports → Group Summary</li>
                <li>Select <strong>Sundry Debtors</strong>, press <strong>Alt+E</strong>, export as XML</li>
                <li>Do same for <strong>Sundry Creditors</strong> and <strong>Bank Accounts</strong></li>
                <li>Save all files in <code className="bg-slate-100 px-1 rounded">C:\Users\jprat\OneDrive\Pictures\ta;lly\</code></li>
              </ol>
            </div>
            <Button onClick={fetchData} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" /> Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPending = contacts.length + banks.length + accounts.length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Review Tally Import</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Data read from your Tally export files. Select records and click Sync to import them into the ERP.
          </p>
        </div>
        <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Cutover / Opening Balance Date
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
              : <Download className="w-4 h-4 mr-2" />}
            Sync {totalSelected} Records
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchData} className="h-9">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Users,    label: 'Customers & Suppliers', count: contacts.length, color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { icon: Landmark, label: 'Bank Accounts',         count: banks.length,    color: 'text-purple-600', bg: 'bg-purple-50' },
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

      {totalPending === 0 ? (
        <Card className="border-dashed bg-slate-50">
          <CardContent className="flex flex-col items-center py-16">
            <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900">No records found</h3>
            <p className="text-slate-500 mt-1 text-sm">Check that Master.xml is in the Tally export folder.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="contacts">
          <TabsList className="mb-4 bg-slate-100">
            <TabsTrigger value="contacts">
              Customers &amp; Suppliers
              <Badge variant="secondary" className="ml-2 bg-white">{contacts.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="banks">
              Bank Accounts
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
                  <CardDescription>Balances are the current ending balance from Tally</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedContacts(contacts.map(c => c.name))}>All</Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedContacts([])}>None</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {contacts.map(c => {
                    const bal = parseFloat(c.closingBalance);
                    const isSelected = selectedContacts.includes(c.name);
                    const isCustomer = c.parent === 'Sundry Debtors';
                    const balColor = bal > 0
                      ? isCustomer ? 'text-emerald-600' : 'text-rose-600'
                      : 'text-slate-400';
                    return (
                      <div
                        key={c.name}
                        className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50/40' : ''}`}
                        onClick={() => setSelectedContacts(prev =>
                          prev.includes(c.name) ? prev.filter(n => n !== c.name) : [...prev, c.name]
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={checked =>
                            setSelectedContacts(prev =>
                              checked ? [...prev, c.name] : prev.filter(n => n !== c.name)
                            )
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
                          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Ending Balance</p>
                          <p className={`font-mono font-bold text-base ${balColor}`}>
                            {formatINR(c.closingBalance)}
                          </p>
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
                  <CardTitle className="text-base">Bank Accounts</CardTitle>
                  <CardDescription>Opening balance will be set in the ERP</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectedBanks(banks.map(b => b.name))}>All</Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedBanks([])}>None</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {banks.map(b => {
                    const bal = parseFloat(b.closingBalance);
                    const isSelected = selectedBanks.includes(b.name);
                    const isCash = (b as any).type === 'cash';
                    return (
                      <div
                        key={b.name}
                        className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50/40' : ''}`}
                        onClick={() => setSelectedBanks(prev =>
                          prev.includes(b.name) ? prev.filter(n => n !== b.name) : [...prev, b.name]
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={checked =>
                            setSelectedBanks(prev =>
                              checked ? [...prev, b.name] : prev.filter(n => n !== b.name)
                            )
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
                  <Button size="sm" variant="outline" onClick={() => setSelectedAccounts(accounts.map(a => a.name))}>All</Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedAccounts([])}>None</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {accounts.map(a => {
                    const isSelected = selectedAccounts.includes(a.name);
                    return (
                      <div
                        key={a.name}
                        className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-amber-50/40' : ''}`}
                        onClick={() => setSelectedAccounts(prev =>
                          prev.includes(a.name) ? prev.filter(n => n !== a.name) : [...prev, a.name]
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={checked =>
                            setSelectedAccounts(prev =>
                              checked ? [...prev, a.name] : prev.filter(n => n !== a.name)
                            )
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
      )}
    </div>
  );
}
