'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStagingMasterData, importSelectedMasters } from '@/lib/actions/tally-import';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function TallyMastersReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState({ contacts: [], banks: [], accounts: [] });
  const [cutoverDate, setCutoverDate] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() - 1);
    return today.toISOString().split('T')[0];
  });
  
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedBanks, setSelectedBanks] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const result = await getStagingMasterData();
      setData(result as any);
      
      // Auto-select all by default
      setSelectedContacts(result.contacts.map((c: any) => c.staging_id));
      setSelectedBanks(result.banks.map((b: any) => b.staging_id));
      setSelectedAccounts(result.accounts.map((a: any) => a.staging_id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleSync = async () => {
    if (!selectedContacts.length && !selectedBanks.length && !selectedAccounts.length) return;
    
    setSyncing(true);
    try {
      const orgId = localStorage.getItem('activeOrgId') || '';
      const userId = localStorage.getItem('activeUserId') || ''; // Adjust depending on auth setup

      const result = await importSelectedMasters({
        contactStagingIds: selectedContacts,
        bankStagingIds: selectedBanks,
        accountStagingIds: selectedAccounts,
        organizationId: orgId,
        cutoverDate,
        userId
      });

      if (result.success) {
        alert(`Successfully synced ${result.count} records to ERP!`);
        fetchData();
      } else {
        alert('Sync failed: ' + result.error);
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during sync.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const totalPending = data.contacts.length + data.banks.length + data.accounts.length;
  const totalSelected = selectedContacts.length + selectedBanks.length + selectedAccounts.length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Review Tally Import</h1>
          <p className="text-slate-500 mt-1">
            Review pending records from Tally before permanently saving them into the ERP.
          </p>
        </div>
        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Cutover Date (Opening Balance Date)
            </label>
            <Input 
              type="date" 
              value={cutoverDate} 
              onChange={(e) => setCutoverDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <Button 
            onClick={handleSync} 
            disabled={totalSelected === 0 || syncing}
            className="bg-emerald-600 hover:bg-emerald-700 h-9"
          >
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Sync {totalSelected} Records
          </Button>
        </div>
      </div>

      {totalPending === 0 ? (
        <Card className="border-dashed bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900">No pending records found</h3>
            <p className="text-slate-500 mt-1">All staging tables are currently empty or fully synced.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="contacts" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="contacts">
              Customers & Suppliers <Badge variant="secondary" className="ml-2">{data.contacts.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="accounts">
              Chart of Accounts <Badge variant="secondary" className="ml-2">{data.accounts.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="banks">
              Bank Accounts <Badge variant="secondary" className="ml-2">{data.banks.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts">
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg">Pending Contacts</CardTitle>
                <CardDescription>Records waiting to be imported into the main contact table.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {data.contacts.map((c: any) => (
                    <div key={c.staging_id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                      <Checkbox 
                        checked={selectedContacts.includes(c.staging_id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedContacts(prev => [...prev, c.staging_id]);
                          else setSelectedContacts(prev => prev.filter(id => id !== c.staging_id));
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{c.name}</p>
                          <Badge variant="outline" className="capitalize text-xs">{c.type}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">
                          Tally Name: {c.tally_ledger_name} | Group: {c.tally_ledger_group}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Opening Balance</p>
                        <p className={`font-mono font-medium ${Number(c.tally_opening_balance) > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                          ₹{Number(c.tally_opening_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounts">
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg">Pending Chart of Accounts</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {data.accounts.map((a: any) => (
                    <div key={a.staging_id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                      <Checkbox 
                        checked={selectedAccounts.includes(a.staging_id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedAccounts(prev => [...prev, a.staging_id]);
                          else setSelectedAccounts(prev => prev.filter(id => id !== a.staging_id));
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{a.name}</p>
                          <Badge variant="outline" className="capitalize text-xs">{a.type}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5 font-mono text-xs">
                          Code: {a.code} | Tally Group: {a.tally_group}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banks">
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg">Pending Bank Accounts</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {data.banks.map((b: any) => (
                    <div key={b.staging_id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                      <Checkbox 
                        checked={selectedBanks.includes(b.staging_id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedBanks(prev => [...prev, b.staging_id]);
                          else setSelectedBanks(prev => prev.filter(id => id !== b.staging_id));
                        }}
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{b.account_name}</p>
                        <p className="text-sm text-slate-500 mt-0.5">
                          Tally Name: {b.tally_ledger_name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
