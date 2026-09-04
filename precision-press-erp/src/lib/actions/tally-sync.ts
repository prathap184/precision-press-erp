'use server';

/**
 * TALLY SYNC QUEUE — SERVER ACTIONS
 * ───────────────────────────────────
 * Server-side functions for managing the tally_sync_queue Supabase table.
 *
 * SECURITY: These functions are called by ERP backend actions ONLY.
 *           The local Connector on the Accounting PC calls the dedicated
 *           /api/tally/connector/* API routes — NOT these server actions.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE REMINDER                                                    │
 * │                                                                          │
 * │  verifyLedgerEntry() or approvePayment()                                 │
 * │         │                                                                │
 * │   enqueueTallySync()  ──── writes ────▶  tally_sync_queue (Supabase)   │
 * │                                                  │                      │
 * │                                           Accounting PC polls            │
 * │                                                  │                      │
 * │                                        Local Connector Service           │
 * │                                                  │                      │
 * │                                         TallyPrime localhost:9000        │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { supabaseServer } from '@/lib/supabase-server';
import {
  TallySyncType,
  TallySyncEvent,
  SalesInvoicePayload,
  ReceiptVoucherPayload,
} from '@/types/tally';

const MAX_RETRIES = 3;

// ─── ID Generator ─────────────────────────────────────────────────────────────

function buildIdempotencyKey(syncType: TallySyncType, refId: string): string {
  return `${syncType}::${refId}`;
}

function generateEventId(syncType: TallySyncType): string {
  return `TSYNC-${syncType.charAt(0)}-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

// ─── Enqueue a Sync Event (called from ERP backend) ───────────────────────────

/**
 * Adds a sync event to the queue if one with the same idempotency key
 * does not already exist in PENDING or SUCCESS state.
 */
export async function enqueueTallySync({
  syncType,
  orderId,
  paymentId,
  customerId,
  payload,
  createdBy,
  // ── Rich metadata fields ──
  voucherId,
  voucherType,
  refId,
  customerName,
  amountSnap,
  parentOrderId,
  childOrderIds,
}: {
  syncType: TallySyncType;
  orderId?: string;
  paymentId?: string;
  customerId?: string;
  payload: TallySyncEvent['payload'];
  createdBy: string;
  // Rich metadata
  voucherId?: string;
  voucherType?: string;
  refId?: string;
  customerName?: string;
  amountSnap?: Record<string, any>;
  parentOrderId?: string;
  childOrderIds?: string[];
}): Promise<{ success: boolean; eventId?: string; skipped?: boolean; reason?: string }> {
  try {
    const effectiveRefId = refId || orderId || paymentId || customerId || 'unknown';
    const idempotencyKey = buildIdempotencyKey(syncType, effectiveRefId);

    // ── Idempotency Check ──────────────────────────────────────────────────────
    const { data: existing } = await supabaseServer
      .from('tally_sync_queue')
      .select('id, status')
      .eq('idempotencyKey', idempotencyKey)
      .in('status', ['PENDING', 'IN_FLIGHT', 'SUCCESS'])
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(`[TallyQueue] Skipping duplicate: ${idempotencyKey} (existing: ${existing.id}, status: ${existing.status})`);
      return { success: true, skipped: true, reason: 'Duplicate idempotency key', eventId: existing.id };
    }

    // ── Create the Sync Event ──────────────────────────────────────────────────
    const eventId = generateEventId(syncType);
    const now = new Date().toISOString();

    const { error } = await supabaseServer.from('tally_sync_queue').insert({
      id: eventId,
      syncType,
      orderId: orderId || null,
      paymentId: paymentId || null,
      customerId: customerId || null,
      idempotencyKey,
      payload,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      createdBy,
      createdAt: now,
      // ── Rich metadata ──
      voucherId: voucherId || null,
      voucherType: voucherType || null,
      refId: refId || null,
      customerName: customerName || null,
      amountSnap: amountSnap || null,
      parentOrderId: parentOrderId || null,
      childOrderIds: childOrderIds || null,
    });

    if (error) throw error;

    console.log(`[TallyQueue] Enqueued: ${eventId} (type: ${syncType}, ref: ${effectiveRefId})`);
    return { success: true, eventId };
  } catch (error: any) {
    console.error('[TallyQueue] Failed to enqueue:', error.message);
    return { success: false, reason: error.message };
  }
}

// ─── Mark a Sync Event Result (called by the Connector via API) ────────────────

export async function markTallySyncResult({
  eventId,
  status,
  tallyResponse,
  error,
}: {
  eventId: string;
  status: 'SUCCESS' | 'FAILED';
  tallyResponse?: TallySyncEvent['tallyResponse'];
  error?: string;
}): Promise<{ success: boolean }> {
  try {
    const { data: existing, error: fetchErr } = await supabaseServer
      .from('tally_sync_queue')
      .select('retryCount, maxRetries, syncType, orderId, paymentId, refId, payload')
      .eq('id', eventId)
      .single();

    if (fetchErr || !existing) {
      console.warn(`[TallyQueue] markResult: Event ${eventId} not found`);
      return { success: false };
    }

    const now = new Date().toISOString();

    if (status === 'SUCCESS') {
      const { error: upErr } = await supabaseServer
        .from('tally_sync_queue')
        .update({
          status: 'SUCCESS',
          processedAt: now,
          lastAttemptAt: now,
          tallyResponse: tallyResponse || null,
          lastError: null,
        })
        .eq('id', eventId);

      if (upErr) throw upErr;

      // Determine the correct ID to update the source record
      const recordId = existing.orderId || existing.paymentId || existing.refId;

      // Update the original record's status to 'COMPLETED'
      if (recordId && existing.syncType) {
        let tableName = '';
        
        switch (existing.syncType) {
          case 'SALES_INVOICE': 
            tableName = 'invoices'; 
            break;
          case 'RECEIPT_VOUCHER': 
            tableName = 'receipt_entries'; 
            break;
          case 'PAYMENT_VOUCHER': 
            tableName = 'payment_entries'; 
            break;
          case 'JOURNAL_VOUCHER': 
            tableName = 'journal_entries'; 
            break;
          case 'CONTRA_VOUCHER': 
            tableName = 'contra_entries'; 
            break;
          case 'FETCH_MASTERS':
            // ── Insert into new staging tables ──
            try {
              const ledgers = (tallyResponse as any)?.json?.ledgers || [];
              const orgId = existing.payload?.organizationId;
              
              if (ledgers.length > 0 && orgId) {
                const contacts = [];
                const banks = [];
                const accounts = [];

                for (const l of ledgers) {
                  const name = l.name || '';
                  const parent = l.parent || '';
                  const openingBalance = l.openingBalance || '0';
                  const gstin = l.gstin || '';
                  const state = l.state || '';

                  // Bank Accounts
                  if (parent.toLowerCase().includes('bank')) {
                    banks.push({
                      organization_id: orgId,
                      tally_ledger_name: name,
                      tally_ledger_group: parent,
                      account_name: name,
                      account_type: 'bank',
                      balance: openingBalance,
                    });
                  } 
                  // Customers & Suppliers
                  else if (parent === 'Sundry Debtors' || parent === 'Sundry Creditors') {
                    contacts.push({
                      organization_id: orgId,
                      tally_ledger_name: name,
                      tally_ledger_group: parent,
                      name: name,
                      type: parent === 'Sundry Debtors' ? 'customer' : 'supplier',
                      tally_opening_balance: openingBalance,
                      tax_number: gstin,
                    });
                  } 
                  // Other Chart of Accounts
                  else {
                    accounts.push({
                      organization_id: orgId,
                      tally_ledger_name: name,
                      tally_group: parent,
                      name: name,
                      code: name.replace(/[^A-Z0-9]/ig, "_").toUpperCase(),
                      type: 'expense', // default, can be reviewed in UI
                    });
                  }
                }

                if (contacts.length > 0) {
                  await supabaseServer.from('contact_tally').upsert(contacts, { onConflict: 'tally_ledger_name' });
                }
                if (banks.length > 0) {
                  await supabaseServer.from('bank_account_tally').upsert(banks, { onConflict: 'tally_ledger_name' });
                }
                if (accounts.length > 0) {
                  await supabaseServer.from('chart_account_tally').upsert(accounts, { onConflict: 'tally_ledger_name' });
                }
              }
            } catch (e) {
              console.error(`[TallyQueue] Failed to insert staging records for FETCH_MASTERS:`, e);
            }
            break;
        }

        if (tableName) {
          try {
            await supabaseServer
              .from(tableName)
              .update({ is_synced_to_erp: true, is_tally_synced: true, tally_synced_at: now })
              .eq('id', recordId);
          } catch (e) {
            console.error(`[TallyQueue] Failed to update source table ${tableName}:`, e);
          }
        }

        // Also update orders & payments tables directly
        try {
          if (existing.syncType === 'SALES_INVOICE') {
            const invRef = existing.refId || existing.orderId || recordId;
            await supabaseServer
              .from('orders')
              .update({ is_tally_synced: true, tally_synced_at: now })
              .or(`invoice_number.eq.${invRef},id.eq.${invRef},invoice_id.eq.${invRef}`);
          } else if (existing.syncType === 'RECEIPT_VOUCHER') {
            const pId = existing.paymentId || existing.refId || recordId;
            await supabaseServer
              .from('payments')
              .update({ is_tally_synced: true, tally_synced_at: now })
              .or(`id.eq.${pId},payment_number.eq.${pId}`);
          }
        } catch (srcErr) {
          console.warn('[TallyQueue] Non-fatal: source record tally sync update failed:', srcErr);
        }
      }
    } else {
      // Check for non-retryable validation errors
      const isNonRetryable = error?.startsWith('FAILED_NON_RETRYABLE:');

      if (isNonRetryable) {
        await supabaseServer
          .from('tally_sync_queue')
          .update({
            status: 'FAILED',
            lastAttemptAt: now,
            lastError: error || 'Non-retryable validation failure',
            tallyResponse: tallyResponse || null,
          })
          .eq('id', eventId);

        console.warn(`[TallyQueue] Event ${eventId} permanently failed (non-retryable): ${error}`);
      } else {
        const newRetryCount = (existing.retryCount || 0) + 1;
        const finalStatus = newRetryCount >= (existing.maxRetries || MAX_RETRIES) ? 'FAILED' : 'PENDING';

        await supabaseServer
          .from('tally_sync_queue')
          .update({
            status: finalStatus,
            retryCount: newRetryCount,
            lastAttemptAt: now,
            lastError: error || 'Unknown error',
            tallyResponse: tallyResponse || null,
          })
          .eq('id', eventId);

        console.warn(`[TallyQueue] Event ${eventId} attempt ${newRetryCount}/${existing.maxRetries} → ${finalStatus}: ${error}`);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[TallyQueue] markResult error:', err.message);
    return { success: false };
  }
}

// ─── Fetch Pending Events (called by the Connector via API) ───────────────────

export async function getPendingTallySyncEvents(limit = 20): Promise<TallySyncEvent[]> {
  const { data, error } = await supabaseServer
    .from('tally_sync_queue')
    .select('*')
    .in('status', ['PENDING', 'IN_FLIGHT'])
    .order('createdAt', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[TallyQueue] getPending error:', error.message);
    return [];
  }

  return (data || []) as TallySyncEvent[];
}

// ─── Mark Events as IN_FLIGHT ──────────────────────────────────────────────────

export async function markTallySyncInFlight(eventIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseServer
    .from('tally_sync_queue')
    .update({ status: 'IN_FLIGHT', lastAttemptAt: now })
    .in('id', eventIds);

  if (error) {
    console.error('[TallyQueue] markInFlight error:', error.message);
  }
}

// ─── Admin: Retry a FAILED event ──────────────────────────────────────────────

export async function retryTallySyncEvent(eventId: string): Promise<{ success: boolean }> {
  try {
    const { error } = await supabaseServer
      .from('tally_sync_queue')
      .update({ status: 'PENDING', retryCount: 0, lastError: null })
      .eq('id', eventId);

    if (error) throw error;
    return { success: true };
  } catch {
    return { success: false };
  }
}

// ─── Dashboard Helper ──────────────────────────────────────────────────────────

export async function getTallySyncEventsForDashboard(limit = 100): Promise<TallySyncEvent[]> {
  try {
    const { data, error } = await supabaseServer
      .from('tally_sync_queue')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as TallySyncEvent[];
  } catch (error) {
    console.error('Failed to get tally events for dashboard', error);
    return [];
  }
}

export async function triggerFetchMasters(createdBy: string): Promise<{ success: boolean; eventId?: string }> {
  return await enqueueTallySync({
    syncType: 'FETCH_MASTERS',
    payload: {},
    createdBy,
    voucherType: 'FetchMasters',
  });
}

// ─── Push All Invoices ─────────────────────────────────────────────────────────

export async function triggerPushAllInvoices(createdBy: string = 'admin'): Promise<{ success: boolean; queued: number; error?: string }> {
  try {
    let queued = 0;

    const { data: invoices, error } = await supabaseServer
      .from('invoices')
      .select('id')
      .eq('status', 'GENERATED')
      .neq('is_synced_to_erp', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!invoices) return { success: true, queued: 0 };

    for (const inv of invoices) {
      await syncGeneratedInvoiceToTally(inv.id, createdBy);
      queued++;
    }

    return { success: true, queued };
  } catch (error: any) {
    console.error('Failed to trigger push all invoices', error);
    return { success: false, queued: 0, error: error.message };
  }
}

// ─── Push All Receipts ────────────────────────────────────────────────────────

export async function triggerPushAllReceipts(createdBy: string = 'admin'): Promise<{ success: boolean; queued: number; error?: string }> {
  try {
    const settings = await getTallySettings();
    let queued = 0;

    const { data: receipts, error } = await supabaseServer
      .from('receipt_entries')
      .select('*')
      .neq('is_synced_to_erp', true)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!receipts || receipts.length === 0) return { success: true, queued: 0 };

    for (const rec of receipts) {
      const receiptEntryNumber: string = rec.id || rec.receipt_entry_number || '';
      const refid: string = rec.refid || '';
      const customerId: string = rec.userid || '';
      const amount = Number(rec.credit) || 0;
      const paymentMode: string = rec.paymentmode || 'CASH';
      const dateStr: string = rec.timestamp ? rec.timestamp.split('T')[0] : new Date().toISOString().split('T')[0];

      // Fetch customer name
      let customerName = customerId;
      try {
        const { data: profile } = await supabaseServer
          .from('contact')
          .select('business_name, name')
          .eq('id', customerId)
          .single();
        if (profile) customerName = (profile as any).business_name || profile.name || customerId;
      } catch (_) {}

      // Determine Agst Ref vs On Account
      // refid == receiptEntryNumber → On Account → empty allocations
      // refid == invoice number     → Agst Ref  → [{invoiceNumber, amount}]
      const isAgstRef = refid && refid !== receiptEntryNumber;
      const tallyAllocations = isAgstRef
        ? [{ invoiceNumber: refid, amount }]
        : [];

      // Determine payment ledger
      const modeUp = paymentMode.toUpperCase();
      const cashLedger  = modeUp === 'CASH' ? (rec.cash_ledger || settings.cashLedgerName || 'Cash') : undefined;
      const bankLedger  = modeUp !== 'CASH' ? (rec.bank_ledger || 'Bank') : undefined;
      const bankName    = rec.bank_name || undefined;
      const upiApp      = rec.upi_app || undefined;
      const utr         = rec.utr || undefined;

      await enqueueTallySync({
        syncType: 'RECEIPT_VOUCHER',
        orderId: receiptEntryNumber,
        customerId,
        createdBy,
        voucherId: receiptEntryNumber,
        voucherType: 'Web Receipt',
        refId: isAgstRef ? refid : receiptEntryNumber,
        customerName,
        amountSnap: {
          amountCredit: amount,
          paymentMode,
          utr: utr || null,
          voucherDate: dateStr,
        },
        payload: {
          receiptEntryNumber,
          customerId,
          totalAmount: amount,
          paymentMode,
          allocations: tallyAllocations,
          type: 'RECEIPT',
          voucherDate: dateStr,
          cashLedger,
          bankLedger,
          bankName,
          upiApp,
          utr,
          tallyCompanyName: settings.companyName,
          customerName,
          action: 'Alter',     // Alter existing Tally vouchers with correct bill allocations
        },
      });
      queued++;
    }

    return { success: true, queued };
  } catch (error: any) {
    console.error('Failed to push all receipts', error);
    return { success: false, queued: 0, error: error.message };
  }
}

// ─── Push All Payments ────────────────────────────────────────────────────────

export async function triggerPushAllPayments(createdBy: string = 'admin'): Promise<{ success: boolean; queued: number; error?: string }> {
  try {
    const settings = await getTallySettings();
    let queued = 0;

    const { data: payments, error } = await supabaseServer
      .from('payment_entries')
      .select('*')
      .neq('is_synced_to_erp', true)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!payments || payments.length === 0) return { success: true, queued: 0 };

    for (const pay of payments) {
      const paymentNumber: string = pay.id || pay.payment_number || '';
      const refid: string = pay.ref_number || '';
      const supplierId: string = pay.supplier_id || '';
      const amount = Number(pay.amount) || 0;
      const paymentMode: string = pay.payment_mode || 'CASH';
      const dateStr: string = pay.payment_date || pay.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];

      // Fetch supplier name
      let supplierName = supplierId;
      if (supplierId) {
        try {
          const { data: profile } = await supabaseServer
            .from('contact')
            .select('business_name, name')
            .eq('id', supplierId)
            .single();
          if (profile) supplierName = (profile as any).business_name || profile.name || supplierId;
        } catch (_) {}
      } else {
        // Fallback to payment category (e.g., 'Expense', 'Employee') instead of remarks
        supplierName = pay.payment_category || 'Miscellaneous Expense';
      }

      // Determine Agst Ref vs On Account
      const isAgstRef = refid && refid !== paymentNumber;
      const tallyAllocations = isAgstRef
        ? [{ invoiceNumber: refid, amount }]
        : [];

      // Determine payment ledger
      const modeUp = paymentMode.toUpperCase();
      const cashLedger  = modeUp === 'CASH' ? (pay.cash_ledger || settings.cashLedgerName || 'Cash') : undefined;
      const bankLedger  = modeUp !== 'CASH' ? (pay.bank_ledger || 'Bank') : undefined;
      const bankName    = pay.bank_name || undefined;
      const upiApp      = pay.upi_app || undefined;
      const utr         = pay.utr || undefined;

      await enqueueTallySync({
        syncType: 'PAYMENT_ENTRY',
        orderId: paymentNumber,
        customerId: supplierId,
        createdBy,
        voucherId: paymentNumber,
        voucherType: 'Payment',
        refId: isAgstRef ? refid : paymentNumber,
        customerName: supplierName,
        amountSnap: {
          amountCredit: amount,
          paymentMode,
          utr: utr || null,
          voucherDate: dateStr,
        },
        payload: {
          voucherNumber: paymentNumber,
          supplierId,
          amount,
          paymentMode,
          allocations: tallyAllocations,
          type: 'PAYMENT',
          voucherDate: dateStr,
          cashLedger,
          bankLedgerName: bankLedger,
          bankName,
          upiApp,
          utr,
          tallyCompanyName: settings.companyName,
          supplierName,
          action: 'Alter',     // Alter existing Tally vouchers with correct bill allocations
          narration: pay.remarks || '',
          isSupplierPayment: !!supplierId,
        },
      });
      queued++;
    }

    return { success: true, queued };
  } catch (error: any) {
    console.error('Failed to push all payments', error);
    return { success: false, queued: 0, error: error.message };
  }
}

// ─── Push All Customers ────────────────────────────────────────────────────────

export async function triggerPushAllCustomers(createdBy: string = 'admin'): Promise<{ success: boolean; queued: number; error?: string }> {
  try {
    let queued = 0;

    const { data: customers, error } = await supabaseServer
      .from('contact')
      .select('id')
      .eq('type', 'customer');

    if (error) throw error;

    for (const cst of (customers || [])) {
      await syncCustomerToTally(cst.id, createdBy);
      queued++;
    }

    return { success: true, queued };
  } catch (error: any) {
    console.error('Failed to trigger push all customers', error);
    return { success: false, queued: 0, error: error.message };
  }
}

// ─── Push All Masters ─────────────────────────────────────────────────────────

export async function triggerPushAllMasters(createdBy: string): Promise<{ success: boolean; queued: number; error?: string }> {
  try {
    const settings = await getTallySettings();
    let queued = 0;

    // Products
    const { data: products } = await supabaseServer.from('inventory_item').select('*');
    const categories = new Set<string>();

    for (const p of (products || [])) {
      if (p.category) categories.add(p.category);
    }

    for (const category of Array.from(categories)) {
      await enqueueTallySync({
        syncType: 'CREATE_STOCKGROUP',
        customerId: `cat-${category}`,
        payload: {
          tallyCompanyName: settings.companyName,
          groupName: category,
          parentGroup: '',
          gstRate: 18,
          hsnCode: '4911',
        },
        createdBy,
        voucherType: 'StockGroup',
        voucherId: `cat-${category}`,
      });
      queued++;
    }

    for (const p of (products || [])) {
      await enqueueTallySync({
        syncType: 'CREATE_PRODUCT',
        customerId: p.id,
        payload: {
          tallyCompanyName: settings.companyName,
          itemName: p.name,
          parentGroup: p.category || 'Primary',
          baseUnit: 'Nos',
          gstRate: parseFloat(p.gst_rate || p.gstRate || '18'),
          hsnCode: p.hsn_code || p.hsnCode || '4911',
        },
        createdBy,
        voucherType: 'StockItem',
        voucherId: p.id,
        customerName: p.name,
      });
      queued++;
    }

    // Customers
    const { data: customers } = await supabaseServer
      .from('contact')
      .select('*')
      .eq('type', 'customer');

    for (const c of (customers || [])) {
      await enqueueTallySync({
        syncType: 'CREATE_CUSTOMER',
        customerId: c.id,
        payload: {
          tallyCompanyName: settings.companyName,
          ledgerName: c.displayName || c.businessName || c.name || 'Customer',
          parentGroup: settings.sundryDebtorsGroup || 'Sundry Debtors',
          address: c.address || '',
          state: c.state || '',
          gstin: c.gstNumber || c.gstin || '',
          contactPerson: c.name || '',
          phone: c.phone || '',
          email: c.email || '',
        },
        createdBy,
        voucherType: 'CustomerLedger',
        voucherId: c.id,
        customerName: c.displayName || c.businessName || c.name || '',
      });
      queued++;
    }

    // Suppliers
    const { data: suppliers } = await supabaseServer
      .from('profiles')
      .select('*')
      .eq('role', 'SUPPLIER');

    for (const s of (suppliers || [])) {
      await enqueueTallySync({
        syncType: 'CREATE_SUPPLIER',
        customerId: s.id,
        payload: {
          tallyCompanyName: settings.companyName,
          ledgerName: s.displayName || s.businessName || s.name || 'Supplier',
          parentGroup: 'Sundry Creditors',
          address: s.address || '',
          state: s.state || '',
          gstin: s.gstNumber || s.gstin || '',
          contactPerson: s.name || '',
          phone: s.phone || '',
          email: s.email || '',
        },
        createdBy,
        voucherType: 'SupplierLedger',
        voucherId: s.id,
        customerName: s.displayName || s.businessName || s.name || '',
      });
      queued++;
    }

    return { success: true, queued };
  } catch (error: any) {
    console.error('Failed to trigger push all masters', error);
    return { success: false, queued: 0, error: error.message };
  }
}

// ─── Sync a single Generated Invoice to Tally ─────────────────────────────────

export async function syncGeneratedInvoiceToTally(invoiceId: string, createdBy: string = 'admin'): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: inv, error } = await supabaseServer
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error || !inv) throw new Error('Invoice not found');

    const customerSnap =
      typeof inv.customer_snapshot === 'string'
        ? JSON.parse(inv.customer_snapshot)
        : (inv.customer_snapshot || {});

    let itemsArr: any[] = [];
    try {
      itemsArr = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []);
    } catch (_) {}

    // Filter only actual items (ignore summary rows like CGST, SGST, Item Total)
    const realItems = itemsArr.filter(
      (i: any) => i.sr || (i.particulars && !i.particulars.includes('└─'))
    );

    const settings = await getTallySettings();
    const customerName =
      customerSnap.name || customerSnap.displayName || customerSnap.businessName || 'Cash Customer';

    const subTotal = Number(inv.taxable_value) || 0;
    const cgst = Number(inv.cgst_amount) || 0;
    const sgst = Number(inv.sgst_amount) || 0;
    const igst = Number(inv.igst_amount) || 0;
    const deliveryCharges = Number(inv.transport_amount) || 0;
    const grandTotal = Number(inv.grand_total) || 0;

    // ── Build amountSnap (human-readable breakdown for audit trail) ────────────
    const amountSnap: Record<string, any> = {
      subTotal,
      cgst,
      sgst,
      igst,
      deliveryCharges,
      grandTotal,
      items: realItems.map((item: any, idx: number) => ({
        label: `Item ${idx + 1}: ${item.particulars || 'Printing Services'}`,
        name: item.particulars || 'Printing Services',
        hsnCode: item.hsn_code || item.hsnCode || '',
        // Printing-specific fields
        width: item.width || item.w || 0,
        length: item.length || item.l || item.height || 0,
        sqft: Number(item.sqft) || Number(item.sq_ft) || 0,
        qty: item.pcs || item.qty || 1,
        rateSft: item.rate_per_sq || item.rate_per_sft || 0,  // Rate per Sq Ft
        per: 'Sq Ft',
        amount: Number(item.amount) || 0,
        finish: item.finish || item.lamination || 'None',
        gstPercent:
          typeof item.gst_percent === 'number'
            ? item.gst_percent * 100
            : Number(item.gst_percent) || 18,
      })),
    };

    // Build per-item narration details
    const itemNarrations = realItems.map((item: any, idx: number) => {
      const w     = item.width  || item.w  || '';
      const l     = item.length || item.l  || item.height || '';
      const finish = item.finish || item.lamination || 'None';
      const sqft  = Number(item.sqft) || Number(item.sq_ft) || 0;
      // Only show Size: WxL when both are pure numbers (flex/solvent printing)
      // For paper sizes like "A2", "A1" just show sq.ft
      const wNum = parseFloat(String(w));
      const lNum = parseFloat(String(l));
      const sizeStr = (!isNaN(wNum) && !isNaN(lNum) && wNum > 0 && lNum > 0)
        ? `Size: ${wNum}ft×${lNum}ft | `
        : '';
      return `Item ${idx + 1}: ${item.particulars || 'Printing Services'} | ${sizeStr}Sq.Ft: ${sqft} | Finish: ${finish}`;
    }).join(' || ');

    const deliveryType = inv.delivery_type || inv.logistics_type || '';

    const payload = {
      tallyCompanyName: settings.companyName,
      invoiceNumber: inv.invoice_number || inv.id,
      invoiceDate: inv.invoice_date
        ? inv.invoice_date.replace(/-/g, '')
        : new Date().toISOString().split('T')[0].replace(/-/g, ''),
      orderDate: inv.invoice_date
        ? inv.invoice_date.replace(/-/g, '')
        : new Date().toISOString().split('T')[0].replace(/-/g, ''),
      customerName,
      customerAddress: customerSnap.address || '',
      state: customerSnap.state || customerSnap.billing_state || 'Karnataka',
      items: realItems.map((item: any) => ({
        productName: item.particulars || 'Printing Services',
        // Tally: Quantity = Sq Ft (total area), Rate = Rate per Sq Ft
        quantity: Number(item.sqft) || Number(item.sq_ft) || item.pcs || item.qty || 1,
        unit: 'Sq Ft',
        sqft: Number(item.sqft) || Number(item.sq_ft) || 0,
        pcs: item.pcs || item.qty || 1,
        width: item.width || item.w || 0,
        length: item.length || item.l || item.height || 0,
        rate: item.rate_per_sq || item.rate_per_sft || 0,   // Rate per Sq Ft
        amount: Number(item.amount) || 0,
        finish: item.finish || item.lamination || 'None',
        gstPercent:
          typeof item.gst_percent === 'number'
            ? item.gst_percent * 100
            : Number(item.gst_percent) || 18,
      })),
      subTotal,
      cgst,
      sgst,
      igst,
      grandTotal,
      deliveryCharges,
      narration: `Invoice: ${inv.invoice_number || inv.id} | ${itemNarrations}${deliveryType ? ` | Delivery: ${deliveryType}` : ''}`,
    };

    await enqueueTallySync({
      syncType: 'SALES_INVOICE',
      orderId: invoiceId,
      customerId: inv.customer_id,
      payload,
      createdBy,
      // ── Rich metadata ──
      voucherId: inv.invoice_number || inv.id,
      voucherType: 'Web Sales',
      refId: inv.invoice_number || inv.id,
      customerName,
      amountSnap,
      parentOrderId: inv.parent_order_id || null,
      childOrderIds: inv.child_order_ids || null,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to sync generated invoice', err);
    return { success: false, error: err.message };
  }
}

// ─── Sync a single Customer to Tally ──────────────────────────────────────────

export async function syncCustomerToTally(customerId: string, createdBy: string = 'admin'): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: cst, error } = await supabaseServer
      .from('contact')
      .select('*')
      .eq('id', customerId)
      .single();

    if (error || !cst) throw new Error('Customer not found');

    const settings = await getTallySettings();
    const ledgerName = cst.displayName || cst.businessName || cst.name || 'Cash Customer';

    const payload = {
      tallyCompanyName: settings.companyName,
      ledgerName,
      parentGroup: settings.sundryDebtorsGroup || 'Sundry Debtors',
      state: cst.state || 'Karnataka',
      country: cst.country || 'India',
      address: cst.address || cst.roadName || '',
      gstin: cst.gstNumber || cst.gstin || '',
      pinCode: cst.pincode || '',
      mobile: cst.phone || '',
    };

    await enqueueTallySync({
      syncType: 'CREATE_CUSTOMER',
      customerId,
      payload,
      createdBy,
      voucherId: customerId,
      voucherType: 'CustomerLedger',
      refId: customerId,
      customerName: ledgerName,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to sync customer', err);
    return { success: false, error: err.message };
  }
}

// ─── Payload Builders (for legacy order-based syncs) ──────────────────────────

export async function buildSalesInvoicePayload(
  orderData: any,
  items: any[],
): Promise<SalesInvoicePayload> {
  const settings = await getTallySettings();

  const toTallyDate = (ts: any): string => {
    const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const gst = orderData.amounts?.gst || 0;
  const base = orderData.amounts?.base || 0;
  const grandTotal = orderData.amounts?.grandTotal || 0;

  return {
    tallyCompanyName: settings.companyName,
    invoiceNumber: orderData.invoiceNumber || orderData.id,
    invoiceDate: toTallyDate(orderData.createdAt),
    orderDate: toTallyDate(orderData.createdAt),
    customerName: orderData.customerSnapshot?.name || orderData.customerName || 'Cash Customer',
    customerAddress: orderData.customerSnapshot?.address,
    items: items.map(item => ({
      productName: item.productName || 'Printing Services',
      quantity: item.specs?.quantity || 1,
      sqft: item.specs?.sqft || 0,
      rate: item.pricingSnapshot?.baseRate || 0,
      amount: item.pricingSnapshot?.subTotal || 0,
      gstPercent: 18,
    })),
    subTotal: base,
    gstAmount: gst,
    grandTotal,
    cgst: orderData.amounts?.taxSplit?.cgst || gst / 2,
    sgst: orderData.amounts?.taxSplit?.sgst || gst / 2,
    igst: orderData.amounts?.taxSplit?.igst || 0,
    salesLedgerName: settings.salesLedgerName,
    gstLedgerName: settings.cgstLedgerName,
    debtorLedgerName:
      orderData.orderType === 'CREDIT'
        ? orderData.customerSnapshot?.name || 'Sundry Debtors'
        : settings.cashLedgerName,
  };
}

export async function buildReceiptVoucherPayload(
  paymentData: any,
  orderData: any,
): Promise<ReceiptVoucherPayload> {
  const settings = await getTallySettings();

  const toTallyDate = (ts: any): string => {
    const d = ts?.toDate ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const mode = (paymentData.paymentMode || '').toUpperCase();
  const bankLedgerName =
    mode === 'CASH'
      ? settings.cashLedgerName
      : mode === 'UPI'
      ? settings.upiLedgerName
      : settings.bankLedgerName;

  return {
    tallyCompanyName: settings.companyName,
    voucherNumber: paymentData.id,
    voucherDate: toTallyDate(paymentData.approvedAt || paymentData.createdAt),
    amount: paymentData.amount,
    orderId: paymentData.orderId,
    invoiceNumber: orderData?.invoiceNumber,
    customerName: paymentData.customerName || orderData?.customerSnapshot?.name || 'Customer',
    paymentMode: paymentData.paymentMode,
    bankLedgerName,
    depositRefNo: paymentData.depositRefNo,
    debtorLedgerName:
      orderData?.orderType === 'CREDIT'
        ? orderData?.customerSnapshot?.name || settings.sundryDebtorsGroup
        : settings.cashLedgerName,
  };
}

// ─── Tally Settings Helper ─────────────────────────────────────────────────────

import { getCachedTallySettings } from '@/lib/cache/config';

export async function getTallySettings() {
  return await getCachedTallySettings();
}

export async function triggerPushAllContra(createdBy: string = 'admin'): Promise<{ success: boolean; queued: number; error?: string }> {
  try {
    const { data: contras, error } = await supabaseServer
      .from('contra_entries')
      .select('*')
      .neq('status', 'SYNCED_TO_TALLY')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!contras || contras.length === 0) return { success: true, queued: 0 };

    let queued = 0;
    for (const c of contras) {
      await enqueueTallySync({
        syncType: 'CONTRA_ENTRY',
        orderId: c.id,
        customerId: 'system',
        createdBy,
        voucherId: c.contra_number,
        voucherType: 'Contra',
        refId: c.contra_number,
        amountSnap: { amount: c.amount, type: c.source_ledger === 'Bank' ? 'BANK_TO_CASH' : 'CASH_TO_BANK' },
        payload: {
          contraEntryNumber: c.contra_number,
          voucherNumber: c.contra_number,
          transferType: c.source_ledger === 'Bank' ? 'BANK_TO_CASH' : 'CASH_TO_BANK',
          amount: c.amount,
          remarks: c.remarks || '',
          voucherDate: c.contra_date || c.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          fromLedgerName: c.source_ledger,
          toLedgerName: c.target_ledger,
          type: 'CONTRA'
        }
      });
      
      await supabaseServer.from('contra_entries').update({ status: 'QUEUED_FOR_TALLY' }).eq('id', c.id);
      queued++;
    }

    return { success: true, queued };
  } catch (err: any) {
    return { success: false, queued: 0, error: err.message };
  }
}

export async function triggerPushAllJournal(createdBy: string = 'admin'): Promise<{ success: boolean; queued: number; error?: string }> {
  try {
    const { data: journals, error } = await supabaseServer
      .from('journal_entries')
      .select('*')
      .neq('status', 'SYNCED_TO_TALLY')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!journals || journals.length === 0) return { success: true, queued: 0 };

    let queued = 0;
    for (const j of journals) {
      let fromLedger = 'Unknown';
      let toLedger = 'Unknown';
      try {
        const { data: profiles } = await supabaseServer
          .from('contact')
          .select('id, name, business_name')
          .in('id', [j.source_customer_id, j.target_customer_id]);
        if (profiles) {
          const fromP = profiles.find(p => p.id === j.source_customer_id);
          const toP = profiles.find(p => p.id === j.target_customer_id);
          if (fromP) fromLedger = (fromP as any).business_name || fromP.name || j.source_customer_id;
          if (toP) toLedger = (toP as any).business_name || toP.name || j.target_customer_id;
        }
      } catch (e) {}

      await enqueueTallySync({
        syncType: 'JOURNAL_ENTRY',
        orderId: j.id,
        customerId: j.source_customer_id || 'system',
        createdBy,
        voucherId: j.journal_number,
        voucherType: 'Journal',
        refId: j.journal_number,
        amountSnap: { amount: j.amount, type: 'JOURNAL' },
        payload: {
          journalEntryNumber: j.journal_number,
          voucherNumber: j.journal_number,
          fromCustomerId: j.source_customer_id,
          toCustomerId: j.target_customer_id,
          totalAmount: j.amount,
          amount: j.amount,
          remarks: j.remarks || '',
          voucherDate: j.journal_date || j.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          type: 'JOURNAL',
          entries: [
            { ledgerName: fromLedger, amount: j.amount, isDebit: false },
            { ledgerName: toLedger, amount: j.amount, isDebit: true }
          ]
        }
      });
      
      await supabaseServer.from('journal_entries').update({ status: 'QUEUED_FOR_TALLY' }).eq('id', j.id);
      queued++;
    }

    return { success: true, queued };
  } catch (err: any) {
    return { success: false, queued: 0, error: err.message };
  }
}

// ─── Fetch Tally Masters from Queue ───────────────────────────────────────────

export async function getTallyMastersFromQueue(): Promise<{
  fetchedAt: string | null;
  ledgers: any[];
}> {
  try {
    const { data, error } = await supabaseServer
      .from('tally_sync_queue')
      .select('tallyResponse, processedAt')
      .eq('syncType', 'FETCH_MASTERS')
      .eq('status', 'SUCCESS')
      .order('processedAt', { ascending: false })
      .limit(1)
      .single();

    if (error || !data || !data.tallyResponse) {
      return { fetchedAt: null, ledgers: [] };
    }

    const ledgers = (data.tallyResponse as any)?.json?.ledgers || [];
    return { fetchedAt: data.processedAt, ledgers };
  } catch (err) {
    console.error('Failed to get tally masters from queue:', err);
    return { fetchedAt: null, ledgers: [] };
  }
}
