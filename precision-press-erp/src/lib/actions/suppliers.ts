'use server';

import { getAuthorizedUser } from './accounts';
import { supabaseServer } from '@/lib/supabase-server';

export async function getSupplierLedgerSummaries() {
  await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  // Get all suppliers from the new dedicated table
  const { data: suppliers, error } = await supabaseServer
    .from('suppliers')
    .select('id, name, email, phone, created_at, tally_ledger_name');

  if (error) throw new Error(error.message);

  return (suppliers || []).map(s => ({
    uid: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    role: 'SUPPLIER', // Hardcoded for UI compatibility
    tallyLedgerName: s.tally_ledger_name,
    createdAt: s.created_at,
    totalSpend: 0, 
    outstandingBalance: 0, 
    lastOrderAt: null
  }));
}

export async function createSupplier(data: {
  name: string;
  gstin?: string;
  address?: string;
  state?: string;
  phone?: string;
  email?: string;
  pan_number?: string;
  contact_person?: string;
  opening_balance?: number;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
}) {
  const authUser = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA', 'SUPER_ADMIN']);
  const tally_ledger_name = data.name; // Use name as default ledger name

  // 1. Insert into Supabase
  const { data: inserted, error: insertErr } = await supabaseServer
    .from('suppliers')
    .insert({
      ...data,
      tally_ledger_name,
      created_by: authUser.id
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);

  // 2. Queue for Tally Sync (CREATE_LEDGER)
  const { error: syncErr } = await supabaseServer
    .from('tally_sync_queue')
    .insert({
      voucher_type: 'Ledger Master', // Tell Tally Connector to create a ledger
      voucher_date: new Date().toISOString().split('T')[0],
      reference_id: inserted.id,
      status: 'PENDING',
      payload: {
        type: 'CREATE_LEDGER',
        ledgerGroup: 'Sundry Creditors',
        name: data.name,
        gstin: data.gstin,
        address: data.address,
        state: data.state,
        phone: data.phone,
        email: data.email
      }
    });

  if (syncErr) {
    console.warn('[createSupplier] Failed to enqueue Tally sync:', syncErr.message);
  }

  return { success: true, supplierId: inserted.id };
}
