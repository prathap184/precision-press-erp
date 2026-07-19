'use server';

/**
 * TALLY SYNC QUEUE — SERVER ACTIONS
 * ───────────────────────────────────
 * Server-side functions for managing the tally_sync_queue Firestore collection.
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
 * │         ▼                                                                │
 * │   enqueueTallySync()  ──── writes ────▶  tally_sync_queue (Firestore)   │
 * │                                                  │                      │
 * │                                           Accounting PC polls            │
 * │                                                  │                      │
 * │                                        Local Connector Service           │
 * │                                                  │                      │
 * │                                         TallyPrime localhost:9000        │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { adminDb } from '@/lib/firebase-admin';
import * as admin from '@/lib/firebase-admin';
import {
  TallySyncType,
  TallySyncEvent,
  SalesInvoicePayload,
  ReceiptVoucherPayload,
} from '@/types/tally';

const SYNC_COLLECTION = 'tally_sync_queue';
const MAX_RETRIES = 3;

// ─── Idempotency Key Generator ─────────────────────────────────────────────────

function buildIdempotencyKey(syncType: TallySyncType, refId: string): string {
  return `${syncType}::${refId}`;
}

// ─── Enqueue a Sync Event (called from ERP backend) ───────────────────────────

/**
 * Adds a sync event to the queue if one with the same idempotency key
 * does not already exist in PENDING or SUCCESS state.
 *
 * This is the primary write function. All other ERP server actions
 * (verifyLedgerEntry, approvePayment, dispatchOrder) should call this.
 */
export async function enqueueTallySync({
  syncType,
  orderId,
  paymentId,
  customerId,
  payload,
  createdBy,
}: {
  syncType: TallySyncType;
  orderId?: string;
  paymentId?: string;
  customerId?: string;
  payload: TallySyncEvent['payload'];
  createdBy: string;
}): Promise<{ success: boolean; eventId?: string; skipped?: boolean; reason?: string }> {
  try {
    const refId = orderId || paymentId || customerId || 'unknown';
    const idempotencyKey = buildIdempotencyKey(syncType, refId);

    // ── Idempotency Check ──────────────────────────────────────────────────────
    // Check if a successful or pending event already exists for this key.
    // This prevents duplicate invoices if the function is called twice.
    const existingSnap = await adminDb
      .collection(SYNC_COLLECTION)
      .where('idempotencyKey', '==', idempotencyKey)
      .where('status', 'in', ['PENDING', 'IN_FLIGHT', 'SUCCESS'])
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0];
      console.log(`[TallyQueue] Skipping duplicate: ${idempotencyKey} (existing: ${existing.id}, status: ${existing.data().status})`);
      return { success: true, skipped: true, reason: 'Duplicate idempotency key', eventId: existing.id };
    }

    // ── Create the Sync Event ──────────────────────────────────────────────────
    const eventId = `TSYNC-${syncType.charAt(0)}-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const now = new Date().toISOString();

    const event: Omit<TallySyncEvent, 'id'> = {
      syncType,
      orderId,
      paymentId,
      customerId,
      idempotencyKey,
      payload,
      status: 'PENDING',
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      createdBy,
      createdAt: now,
    };

    await adminDb.collection(SYNC_COLLECTION).doc(eventId).set({
      id: eventId,
      ...event,
      _serverCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[TallyQueue] Enqueued: ${eventId} (type: ${syncType}, ref: ${refId})`);
    return { success: true, eventId };
  } catch (error: any) {
    console.error('[TallyQueue] Failed to enqueue:', error.message);
    // Never throw — Tally failure should not block the ERP workflow
    return { success: false, reason: error.message };
  }
}

// ─── Mark a Sync Event Result (called by the Connector via API) ────────────────

/**
 * The local Connector Service calls /api/tally/connector/mark-result
 * which calls this function to record the outcome.
 */
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
    const ref = adminDb.collection(SYNC_COLLECTION).doc(eventId);
    const snap = await ref.get();

    if (!snap.exists) {
      console.warn(`[TallyQueue] markResult: Event ${eventId} not found`);
      return { success: false };
    }

    const data = snap.data() as TallySyncEvent;

    if (status === 'SUCCESS') {
      await ref.update({
        status: 'SUCCESS',
        processedAt: new Date().toISOString(),
        lastAttemptAt: new Date().toISOString(),
        tallyResponse: tallyResponse || null,
        lastError: null,
        _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Check for non-retryable validation errors
      const isNonRetryable = error?.startsWith('FAILED_NON_RETRYABLE:');

      if (isNonRetryable) {
        // Immediately mark as permanently FAILED — do not retry
        await ref.update({
          status: 'FAILED',
          lastAttemptAt: new Date().toISOString(),
          lastError: error || 'Non-retryable validation failure',
          tallyResponse: tallyResponse || null,
          _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.warn(`[TallyQueue] Event ${eventId} permanently failed (non-retryable): ${error}`);
      } else {
        // FAILED — increment retry count, re-queue if under max
        const newRetryCount = (data.retryCount || 0) + 1;
        const finalStatus = newRetryCount >= (data.maxRetries || MAX_RETRIES) ? 'FAILED' : 'PENDING';

        await ref.update({
          status: finalStatus,
          retryCount: newRetryCount,
          lastAttemptAt: new Date().toISOString(),
          lastError: error || 'Unknown error',
          tallyResponse: tallyResponse || null,
          _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.warn(`[TallyQueue] Event ${eventId} attempt ${newRetryCount}/${data.maxRetries} → ${finalStatus}: ${error}`);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[TallyQueue] markResult error:', err.message);
    return { success: false };
  }
}

// ─── Fetch Pending Events (called by the Connector via API) ───────────────────

/**
 * Returns pending sync events for the Connector to process.
 * Ordered by createdAt ascending (oldest first).
 */
export async function getPendingTallySyncEvents(limit = 20): Promise<TallySyncEvent[]> {
  const snap = await adminDb
    .collection(SYNC_COLLECTION)
    .where('status', '==', 'PENDING')
    .orderBy('_serverCreatedAt', 'asc')
    .limit(limit)
    .get();

  return snap.docs.map(doc => {
    const d = doc.data();
    // Omit server Firestore Timestamp fields before sending to connector
    const { _serverCreatedAt, _updatedAt, ...rest } = d;
    return rest as TallySyncEvent;
  });
}

// ─── Mark Events as IN_FLIGHT (called by Connector on pickup) ─────────────────

export async function markTallySyncInFlight(eventIds: string[]): Promise<void> {
  const batch = adminDb.batch();
  const now = new Date().toISOString();

  for (const id of eventIds) {
    batch.update(adminDb.collection(SYNC_COLLECTION).doc(id), {
      status: 'IN_FLIGHT',
      lastAttemptAt: now,
      _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}

// ─── Admin: Retry a FAILED event ──────────────────────────────────────────────

export async function retryTallySyncEvent(eventId: string): Promise<{ success: boolean }> {
  try {
    const ref = adminDb.collection(SYNC_COLLECTION).doc(eventId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false };

    await ref.update({
      status: 'PENDING',
      retryCount: 0,
      lastError: null,
      _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch {
    return { success: false };
  }
}

// ─── Payload Builders ──────────────────────────────────────────────────────────

/**
 * Builds a SalesInvoicePayload from an ERP order document.
 * Fetches Tally settings from Firestore to get ledger names.
 */
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
    debtorLedgerName: orderData.orderType === 'CREDIT'
      ? (orderData.customerSnapshot?.name || 'Sundry Debtors')
      : settings.cashLedgerName,
  };
}

/**
 * Builds a ReceiptVoucherPayload from an ERP payment document.
 */
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
    mode === 'CASH' ? settings.cashLedgerName :
    mode === 'UPI'  ? settings.upiLedgerName  :
                      settings.bankLedgerName;

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
    debtorLedgerName: orderData?.orderType === 'CREDIT'
      ? (orderData?.customerSnapshot?.name || settings.sundryDebtorsGroup)
      : settings.cashLedgerName,
  };
}

import { getCachedTallySettings } from '@/lib/cache/config';

// ─── Tally Settings Helper ─────────────────────────────────────────────────────

async function getTallySettings() {
  return await getCachedTallySettings();
}
