'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Users, Landmark, FileSpreadsheet, CheckCircle2, XCircle, ArrowRightCircle, Edit3 } from 'lucide-react';
import { TallyFetchMastersButton } from '../tally/tally-fetch-masters-button';

type TableType = 'contacts' | 'banks' | 'accounts';

export default function TallyMastersPage() {
  const [activeTab, setActiveTab] = useState<TableType>('contacts');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Editing modal state
  const [editingRow, setEditingRow] = useState<{ table: string; item: any } | null>(null);
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Syncing row state
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadStagingData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tally-sync/staging?_t=${Date.now()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch staging data');

      setContacts(data.contacts || []);
      setBanks(data.banks || []);
      setAccounts(data.accounts || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStagingData();
  }, [loadStagingData]);

  // Handle Edit Save
  async function handleSaveEdit() {
    if (!editingRow) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/v1/tally-sync/staging', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: editingRow.table,
          stagingId: editingRow.item.staging_id,
          updates: editFields,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Local state update
      const updateList = (list: any[]) =>
        list.map((r) => (r.staging_id === editingRow.item.staging_id ? { ...r, ...editFields } : r));

      if (editingRow.table === 'contact_tally') setContacts(updateList);
      if (editingRow.table === 'bank_account_tally') setBanks(updateList);
      if (editingRow.table === 'chart_account_tally') setAccounts(updateList);

      setEditingRow(null);
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  }

  // Handle Single Row Sync to ERP Table
  async function syncSingleRow(tableType: TableType, stagingId: string) {
    setSyncingId(stagingId);
    try {
      const body: any = {};
      if (tableType === 'contacts') body.contactIds = [stagingId];
      if (tableType === 'banks') body.bankIds = [stagingId];
      if (tableType === 'accounts') body.accountIds = [stagingId];

      const res = await fetch('/api/v1/tally-sync/import-erp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to sync to ERP');

      // Update import_status locally
      const updateStatus = (list: any[]) =>
        list.map((r) => (r.staging_id === stagingId ? { ...r, import_status: 'imported' } : r));

      if (tableType === 'contacts') setContacts(updateStatus);
      if (tableType === 'banks') setBanks(updateStatus);
      if (tableType === 'accounts') setAccounts(updateStatus);
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncingId(null);
    }
  }

  const formatMoney = (val: any) => {
    const num = Math.abs(parseFloat(String(val || '0').replace(/,/g, '')) || 0);
    return `₹${num.toLocaleString('en-IN')}`;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Tally Masters Staging</h1>
          <p className="text-slate-500 mt-1 text-base">
            View, edit, and sync Tally staging tables directly into main ERP database tables.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadStagingData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <TallyFetchMastersButton />
        </div>
      </div>

      {/* 3 Main Navigation Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveTab('contacts')}
          className={`p-5 rounded-2xl border text-left transition-all flex items-center justify-between shadow-sm ${
            activeTab === 'contacts'
              ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-xl ${activeTab === 'contacts' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staging Table</p>
              <p className="text-lg font-bold text-slate-900">contact_tally</p>
              <p className="text-xs text-slate-500 mt-0.5">Customers, Suppliers & Chart</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm px-3 py-1 font-mono">{contacts.length}</Badge>
        </button>

        <button
          onClick={() => setActiveTab('banks')}
          className={`p-5 rounded-2xl border text-left transition-all flex items-center justify-between shadow-sm ${
            activeTab === 'banks'
              ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-xl ${activeTab === 'banks' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staging Table</p>
              <p className="text-lg font-bold text-slate-900">bank_account_tally</p>
              <p className="text-xs text-slate-500 mt-0.5">Bank & Cash Accounts</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm px-3 py-1 font-mono">{banks.length}</Badge>
        </button>

        <button
          onClick={() => setActiveTab('accounts')}
          className={`p-5 rounded-2xl border text-left transition-all flex items-center justify-between shadow-sm ${
            activeTab === 'accounts'
              ? 'border-purple-600 bg-purple-50/80 ring-2 ring-purple-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-xl ${activeTab === 'accounts' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'}`}>
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staging Table</p>
              <p className="text-lg font-bold text-slate-900">chart_account_tally</p>
              <p className="text-xs text-slate-500 mt-0.5">Chart of Accounts</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm px-3 py-1 font-mono">{accounts.length}</Badge>
        </button>
      </div>

      {/* Main Table Display */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="border-b bg-slate-50/50 pb-4">
          <CardTitle className="text-xl capitalize flex items-center justify-between">
            <span>
              {activeTab === 'contacts' && 'Contacts Staging (contact_tally)'}
              {activeTab === 'banks' && 'Bank Accounts Staging (bank_account_tally)'}
              {activeTab === 'accounts' && 'Chart of Accounts Staging (chart_account_tally)'}
            </span>
          </CardTitle>
          <CardDescription>
            Click Edit to modify staging fields or click Sync to push directly into main ERP tables (`public.contact` / `public.bank_account`).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading staging data...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-500 font-semibold">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              {/* TAB 1: CONTACTS */}
              {activeTab === 'contacts' && (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="p-4">Ledger Name</th>
                      <th className="p-4">Group</th>
                      <th className="p-4">Type</th>
                      <th className="p-4 text-right">Opening Bal</th>
                      <th className="p-4 text-right">Closing Bal</th>
                      <th className="p-4">GSTIN</th>
                      <th className="p-4">State</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contacts.length === 0 ? (
                      <tr><td colSpan={9} className="p-8 text-center text-slate-400">No records in contact_tally</td></tr>
                    ) : (
                      contacts.map((c) => (
                        <tr key={c.staging_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4 font-bold text-slate-900">{c.tally_ledger_name || c.name}</td>
                          <td className="p-4 text-slate-500 text-xs">{c.tally_ledger_group || '—'}</td>
                          <td className="p-4"><Badge variant="outline" className="capitalize">{c.type || 'customer'}</Badge></td>
                          <td className="p-4 text-right font-mono text-slate-600">{formatMoney(c.tally_opening_balance)}</td>
                          <td className="p-4 text-right font-mono font-bold text-slate-900">{formatMoney(c.tally_closing_balance || c.tally_opening_balance)}</td>
                          <td className="p-4 font-mono text-xs text-slate-600">{c.tax_number || c.gstin || '—'}</td>
                          <td className="p-4 text-xs text-slate-600">{c.state || c.billing_state || '—'}</td>
                          <td className="p-4">
                            {c.import_status === 'imported' ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-0 flex items-center w-fit gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Synced to ERP
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="capitalize">{c.import_status || 'pending'}</Badge>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingRow({ table: 'contact_tally', item: c });
                                  setEditFields({
                                    name: c.name,
                                    type: c.type || 'customer',
                                    tax_number: c.tax_number || c.gstin || '',
                                    state: c.state || c.billing_state || '',
                                    tally_closing_balance: c.tally_closing_balance || c.tally_opening_balance || '0',
                                  });
                                }}
                              >
                                <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                disabled={c.import_status === 'imported' || syncingId === c.staging_id}
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={() => syncSingleRow('contacts', c.staging_id)}
                              >
                                {syncingId === c.staging_id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <ArrowRightCircle className="w-3.5 h-3.5 mr-1" /> Sync to ERP
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* TAB 2: BANKS */}
              {activeTab === 'banks' && (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="p-4">Account Name</th>
                      <th className="p-4">Type</th>
                      <th className="p-4 text-right">Balance</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {banks.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-400">No records in bank_account_tally</td></tr>
                    ) : (
                      banks.map((b) => (
                        <tr key={b.staging_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4 font-bold text-slate-900">{b.account_name || b.tally_ledger_name}</td>
                          <td className="p-4"><Badge variant="outline" className="capitalize">{b.account_type || 'checking'}</Badge></td>
                          <td className="p-4 text-right font-mono font-bold text-slate-900">{formatMoney(b.balance || b.tally_closing_balance)}</td>
                          <td className="p-4">
                            {b.import_status === 'imported' ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-0 flex items-center w-fit gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Synced to ERP
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="capitalize">{b.import_status || 'pending'}</Badge>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingRow({ table: 'bank_account_tally', item: b });
                                  setEditFields({
                                    account_name: b.account_name,
                                    account_type: b.account_type || 'checking',
                                    balance: b.balance || b.tally_closing_balance || '0',
                                  });
                                }}
                              >
                                <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                disabled={b.import_status === 'imported' || syncingId === b.staging_id}
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => syncSingleRow('banks', b.staging_id)}
                              >
                                {syncingId === b.staging_id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <ArrowRightCircle className="w-3.5 h-3.5 mr-1" /> Sync to ERP
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* TAB 3: ACCOUNTS */}
              {activeTab === 'accounts' && (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="p-4">Account Name</th>
                      <th className="p-4">Group</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accounts.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-400">No records in chart_account_tally</td></tr>
                    ) : (
                      accounts.map((a) => (
                        <tr key={a.staging_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4 font-bold text-slate-900">{a.name || a.tally_ledger_name}</td>
                          <td className="p-4 text-slate-500 text-xs">{a.tally_group || '—'}</td>
                          <td className="p-4"><Badge variant="outline" className="capitalize">{a.type || 'expense'}</Badge></td>
                          <td className="p-4">
                            {a.import_status === 'imported' ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-0 flex items-center w-fit gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Synced to ERP
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="capitalize">{a.import_status || 'pending'}</Badge>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <Button
                              size="sm"
                              disabled={a.import_status === 'imported' || syncingId === a.staging_id}
                              className="bg-purple-600 hover:bg-purple-700"
                              onClick={() => syncSingleRow('accounts', a.staging_id)}
                            >
                              {syncingId === a.staging_id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <ArrowRightCircle className="w-3.5 h-3.5 mr-1" /> Sync to ERP
                                </>
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={!!editingRow} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Staging Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            {editingRow?.table === 'contact_tally' && (
              <>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={editFields.name || ''}
                    onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Input
                    value={editFields.type || ''}
                    onChange={(e) => setEditFields({ ...editFields, type: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>GSTIN</Label>
                  <Input
                    value={editFields.tax_number || ''}
                    onChange={(e) => setEditFields({ ...editFields, tax_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>State</Label>
                  <Input
                    value={editFields.state || ''}
                    onChange={(e) => setEditFields({ ...editFields, state: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Closing Balance</Label>
                  <Input
                    value={editFields.tally_closing_balance || ''}
                    onChange={(e) => setEditFields({ ...editFields, tally_closing_balance: e.target.value })}
                  />
                </div>
              </>
            )}

            {editingRow?.table === 'bank_account_tally' && (
              <>
                <div className="space-y-1">
                  <Label>Account Name</Label>
                  <Input
                    value={editFields.account_name || ''}
                    onChange={(e) => setEditFields({ ...editFields, account_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Account Type</Label>
                  <Input
                    value={editFields.account_type || ''}
                    onChange={(e) => setEditFields({ ...editFields, account_type: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Balance</Label>
                  <Input
                    value={editFields.balance || ''}
                    onChange={(e) => setEditFields({ ...editFields, balance: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRow(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
