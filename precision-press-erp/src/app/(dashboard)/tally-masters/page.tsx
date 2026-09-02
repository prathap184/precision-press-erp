'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Loader2,
  RefreshCw,
  Users,
  Building2,
  Package,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  Search,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  FileSpreadsheet
} from 'lucide-react';

type MasterType = 'customers' | 'suppliers' | 'items' | 'accounts';

interface TabConfig {
  id: MasterType;
  label: string;
  icon: React.ReactNode;
  unit: string;
}

const TABS: TabConfig[] = [
  { id: 'customers', label: 'Customer Ledgers', icon: <Users className="w-4 h-4 mr-2" />, unit: 'Debtors' },
  { id: 'suppliers', label: 'Supplier Ledgers', icon: <Building2 className="w-4 h-4 mr-2" />, unit: 'Creditors' },
  { id: 'items', label: 'Stock Items & Groups', icon: <Package className="w-4 h-4 mr-2" />, unit: 'Items' },
  { id: 'accounts', label: 'Bank & GL Accounts', icon: <Landmark className="w-4 h-4 mr-2" />, unit: 'Ledgers' },
];

export default function TallyMastersPage() {
  const [activeTab, setActiveTab] = useState<MasterType>('customers');
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'MATCHED' | 'DISCREPANCY'>('ALL');

  // Dynamic summary counts from live API
  const [summary, setSummary] = useState<any | null>(null);

  // Stats & Verification state
  const [auditResult, setAuditResult] = useState<any | null>(null);
  const [lastVerifiedTime, setLastVerifiedTime] = useState<string | null>(null);

  // Load dynamic counts on mount
  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await fetch('/api/v1/tally-masters/sync');
        const data = await res.json();
        if (data.success && data.summary) {
          setSummary(data.summary);
        }
      } catch (err) {
        console.error('Failed to load summary counts:', err);
      }
    }
    loadSummary();
  }, []);

  // Sync confirmation dialog state
  const [syncPreviewOpen, setSyncPreviewOpen] = useState<boolean>(false);
  const [syncPreviewData, setSyncPreviewData] = useState<any | null>(null);
  const [syncPreviewLoading, setSyncPreviewLoading] = useState<boolean>(false);
  const [syncExecuting, setSyncExecuting] = useState<boolean>(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // Verify confirmation dialog state
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState<boolean>(false);

  // ─── Trigger Verification Audit ─────────────────────────────────────────────
  const runVerification = useCallback(async (tab: MasterType) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/tally-masters/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterType: tab }),
      });
      const data = await res.json();
      if (data.success) {
        setAuditResult(data.audit);
        setLastVerifiedTime(new Date().toLocaleTimeString());
      }
    } catch (err: any) {
      console.error('Verification error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset audit state when switching tabs
  useEffect(() => {
    setAuditResult(null);
    setSearchQuery('');
    setFilterMode('ALL');
  }, [activeTab]);

  // ─── Trigger Sync Preview (Opens Confirmation Modal) ─────────────────────────
  async function handleOpenSyncPreview() {
    setSyncPreviewLoading(true);
    setSyncPreviewOpen(true);
    setSyncSuccessMsg(null);
    try {
      const res = await fetch('/api/v1/tally-masters/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterType: activeTab, action: 'preview' }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncPreviewData(data.preview);
      } else {
        alert(`Sync preview error: ${data.error}`);
        setSyncPreviewOpen(false);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
      setSyncPreviewOpen(false);
    } finally {
      setSyncPreviewLoading(false);
    }
  }

  // ─── Execute Confirmed Sync ──────────────────────────────────────────────────
  async function handleExecuteSync() {
    setSyncExecuting(true);
    try {
      const res = await fetch('/api/v1/tally-masters/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterType: activeTab, action: 'execute' }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncSuccessMsg(`Successfully synced: +${data.result.addedCount} new records added, ${data.result.updatedCount} existing records updated!`);
        // Refresh verification audit
        await runVerification(activeTab);
      } else {
        alert(`Sync failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Sync execution error: ${err.message}`);
    } finally {
      setSyncExecuting(false);
    }
  }

  // Filter audit records
  const records = auditResult?.results || [];
  const filteredRecords = records.filter((r: any) => {
    const matchesSearch = !searchQuery ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.tallyData?.gstin && r.tallyData.gstin.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.tallyData?.phone && r.tallyData.phone.includes(searchQuery)) ||
      (r.tallyData?.hsnCode && r.tallyData.hsnCode.includes(searchQuery));

    if (!matchesSearch) return false;
    if (filterMode === 'MATCHED') return r.status === 'MATCHED';
    if (filterMode === 'DISCREPANCY') return r.status !== 'MATCHED';
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ─── Page Header ───────────────────────────────────────────────────────────── */}
      <div className="border-b pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Tally Masters Synchronization & Verification Hub
              </h1>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs font-semibold">
                Website Testing Hindustan
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Select a master module below to run live verification and synchronization against TallyPrime.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Master Category Tabs ────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                isActive
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 font-semibold bg-blue-50/40 dark:bg-blue-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400'
              }`}
            >
              {tab.icon}
              {tab.label}
              <Badge variant={isActive ? 'default' : 'secondary'} className="ml-2.5 text-xs font-normal">
                {summary?.[tab.id]?.tally != null
                  ? `${summary[tab.id].tally.toLocaleString()} ${tab.unit}`
                  : 'Loading...'}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* ─── Dedicated Section Header with Category-Specific Action Buttons ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
            {TABS.find(t => t.id === activeTab)?.icon}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              {TABS.find(t => t.id === activeTab)?.label}
              {summary?.[activeTab]?.tally != null && (
                <span className="text-xs font-normal text-slate-500">
                  ({summary[activeTab].tally.toLocaleString()} {TABS.find(t => t.id === activeTab)?.unit})
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {activeTab === 'customers' && 'Syncs & verifies Sundry Debtors, multi-line addresses, mobile numbers, GSTIN, and branch categories.'}
              {activeTab === 'suppliers' && 'Syncs & verifies Sundry Creditors, payment terms, GSTIN, and vendor balances.'}
              {activeTab === 'items' && 'Syncs & verifies Stock Items across Stock Groups with HSN codes, UOM, and Godown locations.'}
              {activeTab === 'accounts' && 'Syncs & verifies Bank Ledgers, Tax Accounts (CGST/SGST/IGST), and GL codes.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => setVerifyConfirmOpen(true)}
            disabled={loading}
            className="flex items-center gap-2 border-slate-300 dark:border-slate-700 shadow-sm text-xs font-medium h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Verify {TABS.find(t => t.id === activeTab)?.label.split(' ')[0]}
          </Button>

          <Button
            onClick={handleOpenSyncPreview}
            disabled={loading || syncPreviewLoading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs font-medium h-9"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync {TABS.find(t => t.id === activeTab)?.label.split(' ')[0]}
          </Button>
        </div>
      </div>

      {/* ─── Scorecard & Status Banner ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Tally Total Records</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {auditResult
                ? auditResult.totalTally.toLocaleString()
                : summary?.[activeTab]?.tally != null
                ? summary[activeTab].tally.toLocaleString()
                : '...'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Source: TallyPrime Live (Port 9000)
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">ERP Database Records</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {auditResult
                ? auditResult.totalErp.toLocaleString()
                : summary?.[activeTab]?.erp != null
                ? summary[activeTab].erp.toLocaleString()
                : '...'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Target: Supabase PostgreSQL
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Match Score</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              {auditResult ? (
                <>
                  <span className={auditResult.matchPercentage >= 99 ? 'text-emerald-600' : 'text-amber-600'}>
                    {auditResult.matchPercentage}%
                  </span>
                  {auditResult.matchPercentage >= 99 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 inline" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500 inline" />
                  )}
                </>
              ) : '...'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {auditResult ? `${auditResult.matchedCount} verified 100% match` : 'Checking...'}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-semibold">Discrepancies</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-800 dark:text-slate-200">
              {auditResult ? auditResult.discrepancyCount : '...'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {lastVerifiedTime ? `Last audited at ${lastVerifiedTime}` : 'Audit pending'}
          </CardContent>
        </Card>
      </div>

      {/* ─── Filter & Search Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={`Search ${activeTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            variant={filterMode === 'ALL' ? 'default' : 'outline'}
            onClick={() => setFilterMode('ALL')}
            className="text-xs h-8"
          >
            All Records ({records.length})
          </Button>
          <Button
            size="sm"
            variant={filterMode === 'MATCHED' ? 'default' : 'outline'}
            onClick={() => setFilterMode('MATCHED')}
            className="text-xs h-8 text-emerald-700 dark:text-emerald-400"
          >
            ✓ 100% Matched ({auditResult?.matchedCount || 0})
          </Button>
          <Button
            size="sm"
            variant={filterMode === 'DISCREPANCY' ? 'default' : 'outline'}
            onClick={() => setFilterMode('DISCREPANCY')}
            className="text-xs h-8 text-amber-700 dark:text-amber-400"
          >
            ⚠ Discrepancies ({auditResult?.discrepancyCount || 0})
          </Button>
        </div>
      </div>

      {/* ─── Master Records & Audit Table ────────────────────────────────────── */}
      <Card className="shadow-sm border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase">
              <tr>
                <th className="px-4 py-3">Record Name</th>
                <th className="px-4 py-3">Group / Category</th>
                <th className="px-4 py-3">Key Fields</th>
                <th className="px-4 py-3">Audit Status</th>
                <th className="px-4 py-3">Discrepancy Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    Cross-checking records against TallyPrime...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    No records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r: any, idx: number) => {
                  const isMatched = r.status === 'MATCHED';
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {r.name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {r.tallyData?.tallyGroup || r.tallyData?.group || 'Primary'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {activeTab === 'items' ? (
                          <span>HSN: {r.tallyData?.hsnCode || '—'} | UOM: {r.tallyData?.uom}</span>
                        ) : activeTab === 'accounts' ? (
                          <span>Balance: ₹{(r.tallyData?.openingBalance || 0).toLocaleString()}</span>
                        ) : (
                          <span>GSTIN: {r.tallyData?.gstin || 'None'} | Ph: {r.tallyData?.phone || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isMatched ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium">
                            ✓ 100% Matched
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-medium">
                            {r.status === 'MISSING_IN_ERP' ? 'Missing in ERP' : 'Field Difference'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {isMatched ? (
                          <span className="text-slate-400">All fields identical</span>
                        ) : (
                          <div className="space-y-1">
                            {r.discrepancies?.map((d: any, dIdx: number) => (
                              <div key={dIdx} className="text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 p-1.5 rounded text-[11px]">
                                <span className="font-semibold">{d.field}:</span> Tally: &quot;{d.tally}&quot; ➔ ERP: &quot;{d.erp}&quot;
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── Sync Preview & Confirmation Modal ───────────────────────────────── */}
      <Dialog open={syncPreviewOpen} onOpenChange={setSyncPreviewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              Sync Preview & Confirmation
            </DialogTitle>
            <DialogDescription>
              Review the scanned differences before applying any changes to the ERP database.
            </DialogDescription>
          </DialogHeader>

          {syncPreviewLoading ? (
            <div className="py-8 text-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              Scanning Tally masters vs ERP database...
            </div>
          ) : syncSuccessMsg ? (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">{syncSuccessMsg}</p>
            </div>
          ) : syncPreviewData ? (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg text-center border border-blue-200 dark:border-blue-800">
                  <div className="text-xl font-bold text-blue-700 dark:text-blue-300">
                    +{syncPreviewData.newCount}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">New to Add</div>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg text-center border border-amber-200 dark:border-amber-800">
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-300">
                    ~{syncPreviewData.updateCount}
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">To Heal/Update</div>
                </div>

                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg text-center border border-emerald-200 dark:border-emerald-800">
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                    ✓ {syncPreviewData.identicalCount}
                  </div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Already Matching</div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-md text-xs text-slate-600 dark:text-slate-400 space-y-1.5 border">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Field Normalizations Applied:
                </div>
                <div>• Multi-line addresses joined cleanly with commas into 1 line.</div>
                <div>• Phone numbers extracted from address lines and normalized to 10 digits.</div>
                <div>• 10-digit PAN extracted from 15-character GSTIN.</div>
                <div>• Division tags (`HO`/`BO`/`PO`/`SO`) mapped from Tally parent groups.</div>
              </div>

              <div className="border-t pt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                Do you want to proceed with syncing these changes to the ERP database?
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            {syncSuccessMsg ? (
              <Button onClick={() => setSyncPreviewOpen(false)} className="w-full">
                Close
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setSyncPreviewOpen(false)} disabled={syncExecuting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleExecuteSync}
                  disabled={syncExecuting || syncPreviewLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  {syncExecuting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Yes, Sync to ERP
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Verify Confirmation Modal ────────────────────────────────────────── */}
      <Dialog open={verifyConfirmOpen} onOpenChange={setVerifyConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              Confirm Verification Audit
            </DialogTitle>
            <DialogDescription>
              Run a live, field-by-field verification against Tally for <strong>{TABS.find(t => t.id === activeTab)?.label}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-xs text-slate-500 space-y-1 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border">
            <div>• Matches records primarily by <strong>Tally GUID</strong>.</div>
            <div>• Cross-checks Names, Addresses, Phones, GSTIN, PAN, and Balances.</div>
            <div>• Read-only audit: does not alter or overwrite any ERP database records.</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyConfirmOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setVerifyConfirmOpen(false);
                await runVerification(activeTab);
              }}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Start Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
