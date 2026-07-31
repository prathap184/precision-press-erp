'use server';

import { getAuthorizedUser } from './accounts';
import { supabaseServer } from '@/lib/supabase-server';

export async function getSalesRegister(dateFrom?: string, dateTo?: string) {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  let query = supabaseServer
    .from('transactions')
    .select('*')
    .eq('type', 'SALE')
    .order('timestamp', { ascending: false });

  if (dateFrom) query = query.gte('timestamp', `"${dateFrom}T00:00:00Z"`);
  if (dateTo) query = query.lte('timestamp', `"${dateTo}T23:59:59Z"`);

  const { data: transactions, error } = await query;
  if (error) throw new Error(error.message);

  const userIds = [...new Set(transactions.map(t => t.userId).filter(Boolean))];
  
  let profiles: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: profileData } = await supabaseServer
      .from('contact')
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

export async function getReceiptRegister(dateFrom?: string, dateTo?: string) {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  let query = supabaseServer
    .from('transactions')
    .select('*')
    .eq('type', 'RECEIPT')
    .order('timestamp', { ascending: false });

  if (dateFrom) query = query.gte('timestamp', `"${dateFrom}T00:00:00Z"`);
  if (dateTo) query = query.lte('timestamp', `"${dateTo}T23:59:59Z"`);

  const { data: transactions, error } = await query;
  if (error) throw new Error(error.message);

  const userIds = [...new Set(transactions.map(t => t.userId).filter(Boolean))];
  
  let profiles: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: profileData } = await supabaseServer
      .from('contact')
      .select('id, name')
      .in('id', userIds);
    if (profileData) {
      profiles = profileData.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {});
    }
  }

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

export async function getQuotationRegister(dateFrom?: string, dateTo?: string) {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  let query = supabaseServer
    .from('quotations')
    .select(`
      *,
      profiles (
        name
      )
    `)
    .order('created_at', { ascending: false });

  if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00Z');
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z');

  const { data: quotations, error } = await query;
  if (error) throw new Error(error.message);

  return quotations.map(q => ({
    ...q,
    customerName: q.profiles?.name || q.customer_snapshot?.name || 'Unknown Customer',
    status: q.status || 'PENDING',
  }));
}

export async function getPaymentRegister(dateFrom?: string, dateTo?: string) {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  let query = supabaseServer
    .from('payment_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00Z');
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z');

  const { data: entries, error } = await query;
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

export async function getJournalRegister(dateFrom?: string, dateTo?: string) {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  let query = supabaseServer
    .from('journal_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00Z');
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z');

  const { data: entries, error } = await query;
  if (error) throw new Error(error.message);

  const userIds = [...new Set(entries.flatMap(e => [e.source_customer_id, e.target_customer_id]).filter(Boolean))];
  
  let profiles: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: profileData } = await supabaseServer
      .from('contact')
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

export async function getContraRegister(dateFrom?: string, dateTo?: string) {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  let query = supabaseServer
    .from('contra_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00Z');
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z');

  const { data: entries, error } = await query;
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

export async function getGeneralLedger(dateFrom?: string, dateTo?: string, filterType?: 'CASH' | 'BANK' | 'ALL', filterName?: string) {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  // 1. Fetch all transactions to compute opening balance AND rows
  // To avoid fetching all data forever, we can do two queries: 
  // one for opening balance and one for rows.
  // But given the simplicity, doing two queries is clean.
  
  let openingBal = 0;
  
  // Opening Balance Query
  if (dateFrom) {
    let obQuery = supabaseServer.from('transactions').select('debit, credit, cash_ledger, bank_ledger, paymentMode').lt('timestamp', `"${dateFrom}T00:00:00Z"`);
    if (filterType === 'CASH') {
      obQuery = obQuery.eq('ledgerType', 'CASH');
    } else if (filterType === 'BANK' && filterName) {
      obQuery = obQuery.eq('ledgerType', 'BANK').or(`bank_ledger.eq."${filterName}",bank_name.eq."${filterName}"`);
    }
    const { data: obData } = await obQuery;
    if (obData) {
      openingBal = obData.reduce((sum, r) => sum + (Number(r.credit) || 0) - (Number(r.debit) || 0), 0);
    }
  }

  // Rows Query
  let query = supabaseServer
    .from('transactions')
    .select('*')
    .order('timestamp', { ascending: true }); 

  if (dateFrom) query = query.gte('timestamp', `"${dateFrom}T00:00:00Z"`);
  if (dateTo) query = query.lte('timestamp', `"${dateTo}T23:59:59Z"`);
  if (filterType === 'CASH') {
    query = query.eq('ledgerType', 'CASH');
  } else if (filterType === 'BANK' && filterName) {
    query = query.eq('ledgerType', 'BANK').or(`bank_ledger.eq."${filterName}",bank_name.eq."${filterName}"`);
  }

  const { data: entries, error } = await query;
  if (error) throw new Error(error.message);

  const userIds = [...new Set(entries.map(e => e.userId).filter(Boolean))];
  
  let parties: Record<string, string> = {};
  if (userIds.length > 0) {
    const [{ data: profileData }, { data: supplierData }] = await Promise.all([
      supabaseServer.from('contact').select('id, name').in('id', userIds),
      supabaseServer.from('suppliers').select('id, name').in('id', userIds)
    ]);
    
    if (profileData) profileData.forEach(p => { parties[p.id] = p.name; });
    if (supplierData) supplierData.forEach(s => { parties[s.id] = s.name; });
  }

  const ledger = entries.map(e => {
    const debit = Number(e.debit) || 0;
    const credit = Number(e.credit) || 0;

    let partyName = e.userId ? (parties[e.userId] || 'Unknown Party') : '';
    if (e.type === 'PAYMENT' && !e.userId && e.remarks) partyName = e.remarks;

    let accountName = '-';
    if (e.type === 'SALE') accountName = 'Sales';
    else if (e.type === 'RECEIPT') accountName = `Debtors - ${partyName}`;
    else if (e.type === 'PAYMENT' && e.userId) accountName = `Creditors - ${partyName}`;
    else if (e.type === 'PAYMENT' && !e.userId) accountName = e.cash_ledger || e.bank_ledger || 'Cash';
    else if (e.type === 'CONTRA') {
      if (e.paymentMode === 'BANK_TO_CASH') accountName = 'Bank -> Cash';
      else if (e.paymentMode === 'CASH_TO_BANK') accountName = 'Cash -> Bank';
      else accountName = 'Contra';
    }
    else if (e.type === 'JOURNAL') accountName = 'Journal';

    return {
      id: e.id,
      timestamp: e.timestamp,
      account: accountName,
      party: partyName || '-',
      debit,
      credit,
      balance: 0,
      voucherType: e.type,
      paymentMode: e.paymentMode || '-',
      bankLedger: e.bank_ledger || e.bank_name || '-',
      voucherNo: String(e.id).replace(/-BANK$/, '').replace(/-CASH$/, '').replace(/-CR$/, '').replace(/-DR$/, ''),
      refId: e.refId,
      invoiceId: e.type === 'SALE' ? e.refId : undefined
    };
  });

  return {
    rows: ledger.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    openingBalance: openingBal
  };
}

export async function getDayBook(dateFrom?: string, dateTo?: string) {
  await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);

  let openingBal = 0;
  if (dateFrom) {
    const [txs, pays, contras] = await Promise.all([
      supabaseServer.from('transactions').select('debit, credit').lt('timestamp', `"${dateFrom}T00:00:00Z"`),
      supabaseServer.from('payment_entries').select('amount').lt('created_at', dateFrom + 'T00:00:00Z'),
      supabaseServer.from('contra_entries').select('amount').lt('created_at', dateFrom + 'T00:00:00Z')
    ]);
    
    // Sum from transactions
    if (txs.data) openingBal += txs.data.reduce((sum, r) => sum + (Number(r.credit) || 0) - (Number(r.debit) || 0), 0);
    // Note: DayBook previous code just did credit - debit for all rows. 
    // Payments are usually credits. Contras are 0 net impact but previously DayBook did not filter them perfectly.
    // To match exact previous logic for DayBook where they had `amount` mapping:
    // Actually, DayBook opening balance logic was:
    // for r of rows (all rows): bal += (r.credit - r.debit)
    // For payments, debit=0, credit=amount. 
    // For contras, debit=amount, credit=amount. So net 0.
    if (pays.data) openingBal += pays.data.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }

  let tQuery = supabaseServer.from('transactions').select('*').order('timestamp', { ascending: false });
  let pQuery = supabaseServer.from('payment_entries').select('*').order('created_at', { ascending: false });
  let cQuery = supabaseServer.from('contra_entries').select('*').order('created_at', { ascending: false });

  if (dateFrom) {
    tQuery = tQuery.gte('timestamp', `"${dateFrom}T00:00:00Z"`);
    pQuery = pQuery.gte('created_at', dateFrom + 'T00:00:00Z');
    cQuery = cQuery.gte('created_at', dateFrom + 'T00:00:00Z');
  }
  if (dateTo) {
    tQuery = tQuery.lte('timestamp', `"${dateTo}T23:59:59Z"`);
    pQuery = pQuery.lte('created_at', dateTo + 'T23:59:59Z');
    cQuery = cQuery.lte('created_at', dateTo + 'T23:59:59Z');
  }

  const [{ data: txns }, { data: payEntries }, { data: contraEntries }] = await Promise.all([
    tQuery, pQuery, cQuery
  ]);

  const allUserIds = [...new Set((txns || []).map(t => t.userId).filter(Boolean))];
  let parties: Record<string, string> = {};
  if (allUserIds.length > 0) {
    const [{ data: profileData }, { data: supplierData }] = await Promise.all([
      supabaseServer.from('contact').select('id, name').in('id', allUserIds),
      supabaseServer.from('suppliers').select('id, name').in('id', allUserIds),
    ]);
    if (profileData) profileData.forEach(p => { parties[p.id] = p.name; });
    if (supplierData) supplierData.forEach(s => { parties[s.id] = s.name; });
  }

  const rows = (txns || []).map(t => {
    let party = t.userId ? (parties[t.userId] || 'Unknown') : '';
    if (t.type === 'PAYMENT' && !t.userId && t.remarks) party = t.remarks;
    if ((t.type === 'CONTRA' || t.type === 'JOURNAL') && !party) party = t.remarks || '-';

    return {
      id: t.id,
      date: t.timestamp,
      voucherType: t.type as string,
      voucherNo: String(t.id),
      party,
      paymentMode: t.paymentMode || null,
      amount: Number(t.debit) || Number(t.credit) || 0,
      debit: Number(t.debit) || 0,
      credit: Number(t.credit) || 0,
      status: 'Submitted',
      refId: t.refId || undefined,
      invoiceId: t.type === 'SALE' ? t.refId : undefined,
    };
  });

  const supplierIds = [...new Set((payEntries || []).map(e => e.supplier_id).filter(Boolean))];
  let supplierNames: Record<string, string> = {};
  if (supplierIds.length > 0) {
    const { data: supData } = await supabaseServer.from('suppliers').select('id, name').in('id', supplierIds);
    if (supData) supData.forEach(s => { supplierNames[s.id] = s.name; });
  }

  const payRows = (payEntries || []).map(e => ({
    id: `pe-${e.id}`,
    date: e.created_at,
    voucherType: 'PAYMENT',
    voucherNo: e.payment_number || String(e.id),
    party: e.payment_category === 'Supplier' || !e.payment_category
      ? (supplierNames[e.supplier_id] || 'Unknown Supplier') : `${e.payment_category}`,
    paymentMode: e.payment_mode || null,
    amount: Number(e.amount) || 0,
    debit: 0,
    credit: Number(e.amount) || 0,
    status: 'Submitted',
    refId: e.ref_number || undefined,
    invoiceId: undefined,
  }));

  const contraRows = (contraEntries || []).map(c => ({
    id: `ce-${c.id}`,
    date: c.contra_date || c.created_at,
    voucherType: 'CONTRA',
    voucherNo: c.contra_number || String(c.id),
    party: c.remarks || `${c.source_ledger} -> ${c.target_ledger}`,
    paymentMode: null,
    amount: Number(c.amount) || 0,
    debit: Number(c.amount) || 0,
    credit: Number(c.amount) || 0,
    status: c.status || 'Submitted',
    refId: c.contra_number,
    invoiceId: undefined,
  }));

  const contraMap = new Map((contraEntries || []).map(c => [c.contra_number || String(c.id), `${c.source_ledger} -> ${c.target_ledger}`]));
  const seenBaseVouchers = new Set();
  const allRows: any[] = [];
  
  for (const r of [...rows, ...payRows]) {
    const baseVoucherNo = r.voucherNo.replace(/-BANK$/, '').replace(/-CASH$/, '').replace(/-CR$/, '').replace(/-DR$/, '');
    seenBaseVouchers.add(baseVoucherNo);
    if (r.voucherType === 'CONTRA' || r.voucherType === 'JOURNAL') {
      r.voucherNo = baseVoucherNo;
      if (r.voucherType === 'CONTRA' && contraMap.has(baseVoucherNo)) {
        if (r.party === '-') r.party = contraMap.get(baseVoucherNo) as string;
      }
    }
    allRows.push(r);
  }

  for (const r of contraRows) {
    if (!seenBaseVouchers.has(r.voucherNo)) {
      seenBaseVouchers.add(r.voucherNo);
      allRows.push(r);
    }
  }

  return {
    rows: allRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    openingBalance: openingBal
  };
}
