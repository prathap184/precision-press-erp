'use server';

import { getAuthorizedUser } from './accounts';
import { supabaseServer } from '@/lib/supabase-server';

export async function getSalesRegister() {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  const { data: transactions, error } = await supabaseServer
    .from('transactions')
    .select('*')
    .eq('type', 'SALE')
    .order('timestamp', { ascending: false });

  if (error) throw new Error(error.message);

  const userIds = [...new Set(transactions.map(t => t.userId).filter(Boolean))];
  
  let profiles: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: profileData } = await supabaseServer
      .from('profiles')
      .select('id, name')
      .in('id', userIds);
    if (profileData) {
      profiles = profileData.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});
    }
  }

  // Compute payment status based on linked receipts and fetch invoice IDs
  const invoiceNumbers = transactions.map(t => t.sale_entry_number).filter(Boolean);
  let receiptSums: Record<string, number> = {};
  let invoiceIds: Record<string, string> = {};
  
  if (invoiceNumbers.length > 0) {
    // Fetch receipts
    const { data: linkedReceipts } = await supabaseServer
      .from('transactions')
      .select('link, credit')
      .eq('type', 'RECEIPT')
      .in('link', invoiceNumbers);
      
    if (linkedReceipts) {
      linkedReceipts.forEach(r => {
        if (r.link) {
          receiptSums[r.link] = (receiptSums[r.link] || 0) + (Number(r.credit) || 0);
        }
      });
    }
    
    // Fetch invoice IDs
    const { data: invoicesData } = await supabaseServer
      .from('invoices')
      .select('id, invoice_number')
      .in('invoice_number', invoiceNumbers);
      
    if (invoicesData) {
      invoicesData.forEach(inv => {
        if (inv.invoice_number && inv.id) {
          invoiceIds[inv.invoice_number] = inv.id;
        }
      });
    }
  }

  return transactions.map(t => {
    const totalAmount = Number(t.debit) || 0;
    const paidAmount = t.sale_entry_number ? (receiptSums[t.sale_entry_number] || 0) : 0;
    
    let status = 'Unpaid';
    if (paidAmount >= totalAmount && totalAmount > 0) {
      status = 'Paid';
    } else if (paidAmount > 0) {
      status = 'Partially Paid';
    }

    return {
      ...t,
      customerName: profiles[t.userId] || 'Unknown Customer',
      status: status,
      invoiceId: t.sale_entry_number ? invoiceIds[t.sale_entry_number] : undefined,
    };
  });
}

export async function getReceiptRegister() {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  const { data: transactions, error } = await supabaseServer
    .from('transactions')
    .select('*')
    .eq('type', 'RECEIPT')
    .order('timestamp', { ascending: false });

  if (error) throw new Error(error.message);

  const userIds = [...new Set(transactions.map(t => t.userId).filter(Boolean))];
  
  let profiles: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: profileData } = await supabaseServer
      .from('profiles')
      .select('id, name')
      .in('id', userIds);
    if (profileData) {
      profiles = profileData.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});
    }
  }

  // Fetch invoice IDs for the receipts based on t.refId
  const invoiceNumbers = transactions.map(t => t.refId).filter(Boolean);
  let invoiceIds: Record<string, string> = {};

  if (invoiceNumbers.length > 0) {
    const { data: invoicesData } = await supabaseServer
      .from('invoices')
      .select('id, invoice_number')
      .in('invoice_number', invoiceNumbers);
      
    if (invoicesData) {
      invoicesData.forEach(inv => {
        if (inv.invoice_number && inv.id) {
          invoiceIds[inv.invoice_number] = inv.id;
        }
      });
    }
  }

  return transactions.map(t => ({
    ...t,
    customerName: profiles[t.userId] || 'Unknown Customer',
    invoiceId: t.refId ? invoiceIds[t.refId] : undefined,
  }));
}

export async function getQuotationRegister() {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  const { data: quotations, error } = await supabaseServer
    .from('quotations')
    .select(`
      *,
      profiles (
        name
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return quotations.map(q => ({
    ...q,
    customerName: q.profiles?.name || q.customer_snapshot?.name || 'Unknown Customer',
    status: q.status || 'PENDING',
  }));
}

export async function getPaymentRegister() {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  const { data: entries, error } = await supabaseServer
    .from('payment_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const userIds = [...new Set(entries.map(e => e.supplier_id).filter(Boolean))];
  
  let suppliers: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: supplierData } = await supabaseServer
      .from('suppliers')
      .select('id, name')
      .in('id', userIds);
    if (supplierData) {
      suppliers = supplierData.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});
    }
  }

  return entries.map(e => ({
    id: e.id,
    userId: e.supplier_id,
    customerName: e.payment_category === 'Supplier' || !e.payment_category
      ? (suppliers[e.supplier_id] || 'Unknown Supplier') 
      : `${e.payment_category} Expense`,
    type: 'PAYMENT',
    credit: e.amount,
    debit: 0,
    timestamp: e.created_at,
    status: 'Verified',
    receipt_entry_number: e.payment_number,
    refId: e.ref_number || undefined,
  }));
}

export async function getJournalRegister() {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  const { data: entries, error } = await supabaseServer
    .from('journal_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const userIds = [...new Set(entries.flatMap(e => [e.source_customer_id, e.target_customer_id]).filter(Boolean))];
  
  let profiles: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: profileData } = await supabaseServer
      .from('profiles')
      .select('id, name')
      .in('id', userIds);
    if (profileData) {
      profiles = profileData.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});
    }
  }

  return entries.map(e => ({
    id: e.id,
    userId: e.source_customer_id,
    customerName: `${profiles[e.source_customer_id] || 'Unknown'} -> ${profiles[e.target_customer_id] || 'Unknown'}`,
    type: 'JOURNAL',
    credit: e.amount,
    debit: 0,
    timestamp: e.created_at,
    status: 'Verified',
  }));
}

export async function getContraRegister() {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  const { data: entries, error } = await supabaseServer
    .from('contra_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return entries.map(e => ({
    id: e.id,
    userId: 'SYSTEM',
    customerName: `${e.source_ledger} -> ${e.target_ledger}`,
    type: 'CONTRA',
    credit: e.amount,
    debit: 0,
    timestamp: e.created_at,
    status: 'Verified',
  }));
}
export async function getGeneralLedger() {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  const { data: entries, error } = await supabaseServer
    .from('transactions')
    .select('*')
    .order('timestamp', { ascending: true }); // Need ascending for running balance

  if (error) throw new Error(error.message);

  const userIds = [...new Set(entries.map(e => e.userId).filter(Boolean))];
  
  let parties: Record<string, string> = {};
  if (userIds.length > 0) {
    const [{ data: profileData }, { data: supplierData }] = await Promise.all([
      supabaseServer.from('profiles').select('id, name').in('id', userIds),
      supabaseServer.from('suppliers').select('id, name').in('id', userIds)
    ]);
    
    if (profileData) {
      profileData.forEach(p => { parties[p.id] = p.name; });
    }
    if (supplierData) {
      supplierData.forEach(s => { parties[s.id] = s.name; });
    }
  }

  const ledger = entries.map(e => {
    const debit = Number(e.debit) || 0;
    const credit = Number(e.credit) || 0;

    let partyName = e.userId ? (parties[e.userId] || 'Unknown Party') : '';
    if (e.type === 'PAYMENT' && !e.userId && e.remarks) {
      partyName = e.remarks; // For Expense payments
    }

    let accountName = '-';
    if (e.type === 'SALE') accountName = 'Sales';
    else if (e.type === 'RECEIPT') accountName = `Debtors - ${partyName}`;
    else if (e.type === 'PAYMENT' && e.userId) accountName = `Creditors - ${partyName}`;
    else if (e.type === 'PAYMENT' && !e.userId) accountName = e.cash_ledger || e.bank_ledger || 'Cash';
    else if (e.type === 'CONTRA' || e.type === 'JOURNAL') accountName = 'Journal';

    return {
      id: e.id,
      timestamp: e.timestamp,
      account: accountName,
      party: partyName,
      debit,
      credit,
      balance: 0,
      voucherType: e.type,
      paymentMode: e.paymentMode || '-',
      bankLedger: e.bank_ledger || e.bank_name || '-',
      voucherNo: String(e.id),
      refId: e.refId,
      invoiceId: e.type === 'SALE' ? e.refId : undefined
    };
  });

  // Re-sort descending so the newest is at top for display
  return ledger.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── Day Book ─────────────────────────────────────────────────────────────────
// Voucher-oriented view of all transactions for a date range.
export async function getDayBook() {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);

  // 1. Fetch all transactions (SALE, RECEIPT, PAYMENT, JOURNAL, CONTRA)
  const { data: txns, error: txError } = await supabaseServer
    .from('transactions')
    .select('*')
    .order('timestamp', { ascending: false });

  if (txError) throw new Error(txError.message);

  // 2. Resolve party names from profiles + suppliers
  const allUserIds = [...new Set(txns.map(t => t.userId).filter(Boolean))];
  let parties: Record<string, string> = {};
  if (allUserIds.length > 0) {
    const [{ data: profileData }, { data: supplierData }] = await Promise.all([
      supabaseServer.from('profiles').select('id, name').in('id', allUserIds),
      supabaseServer.from('suppliers').select('id, name').in('id', allUserIds),
    ]);
    if (profileData) profileData.forEach(p => { parties[p.id] = p.name; });
    if (supplierData) supplierData.forEach(s => { parties[s.id] = s.name; });
  }

  // 3. Map transactions to Day Book rows
  const rows = txns.map(t => {
    let party = t.userId ? (parties[t.userId] || 'Unknown') : '';
    if (t.type === 'PAYMENT' && !t.userId && t.remarks) party = t.remarks;
    if ((t.type === 'CONTRA' || t.type === 'JOURNAL') && !party) {
      party = t.remarks || '-';
    }

    const amount = Number(t.debit) || Number(t.credit) || 0;
    const voucherNo = t.id;

    return {
      id: t.id,
      date: t.timestamp,
      voucherType: t.type as string,
      voucherNo: String(voucherNo),
      party,
      paymentMode: t.paymentMode || null,
      amount,
      debit: Number(t.debit) || 0,
      credit: Number(t.credit) || 0,
      status: 'Submitted',
      refId: t.refId || undefined,
      invoiceId: t.type === 'SALE' ? t.refId : undefined,
    };
  });

  // 4. Fetch payment entries (expense / supplier payments)
  const { data: payEntries } = await supabaseServer
    .from('payment_entries')
    .select('*')
    .order('created_at', { ascending: false });

  const supplierIds = [...new Set((payEntries || []).map(e => e.supplier_id).filter(Boolean))];
  let supplierNames: Record<string, string> = {};
  if (supplierIds.length > 0) {
    const { data: supData } = await supabaseServer
      .from('suppliers').select('id, name').in('id', supplierIds);
    if (supData) supData.forEach(s => { supplierNames[s.id] = s.name; });
  }

  const payRows = (payEntries || []).map(e => ({
    id: `pe-${e.id}`,
    date: e.created_at,
    voucherType: 'PAYMENT',
    voucherNo: e.payment_number || String(e.id),
    party: e.payment_category === 'Supplier' || !e.payment_category
      ? (supplierNames[e.supplier_id] || 'Unknown Supplier')
      : `${e.payment_category}`,
    paymentMode: e.payment_mode || null,
    amount: Number(e.amount) || 0,
    debit: 0,
    credit: Number(e.amount) || 0,
    status: 'Submitted',
    refId: e.ref_number || undefined,
    invoiceId: undefined,
  }));

  // 5. Merge and sort newest first
  const allRows = [...rows, ...payRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return allRows;
}
