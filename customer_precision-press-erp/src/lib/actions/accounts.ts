// @ts-nocheck
'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import * as admin from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { UserProfile, UserRole, getEffectiveRoles } from '@/types/auth';

async function getAuthorizedUser(allowedRoles: UserRole[]) {
  const token = cookies().get('customer_session')?.value;
  if (!token) throw new Error('Auth required');
  const decoded = await adminAuth.verifyIdToken(token);

  const profileSnap = await adminDb.collection('profiles').doc(decoded.uid).get();
  const profile = profileSnap.exists ? (profileSnap.data() as UserProfile) : null;
  const effectiveRoles = getEffectiveRoles(profile);

  const claimedRole = decoded.role as UserRole | undefined;
  const authorizedRoles = new Set<UserRole>([
    ...effectiveRoles,
    ...(claimedRole ? [claimedRole] : []),
  ]);

  if (!allowedRoles.some(role => authorizedRoles.has(role))) {
    throw new Error('Permission denied');
  }

  return { id: decoded.uid, role: (profile?.role ?? claimedRole ?? 'CUSTOMER') as UserRole };
}

export interface LedgerEntry {
  id: string;
  userId: string;
  userName?: string;
  type: 'SALE' | 'RECEIPT' | 'CREDIT_ADJUSTMENT';
  ledgerType?: 'CASH' | 'CREDIT';
  refId: string; // OrderId or PaymentId
  debit: number;
  credit: number;
  balanceBefore: number;
  balanceAfter: number;
  availableCredit: number;
  remarks: string;
  createdBy: string;
  timestamp: string;
  isVerified?: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  creditLimit?: number;
}

export async function getLedger(filters?: { userId?: string; limit?: number }) {
  await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);

  let query = adminDb.collection('transactions').orderBy('timestamp', 'desc');
  
  if (filters?.userId) {
    query = query.where('userId', '==', filters.userId);
  }
  
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const snap = await query.get();
  const entries: LedgerEntry[] = [];
  
  // We'll also fetch user names in a map
  const userNames: Record<string, any> = {};

  for (const doc of snap.docs) {
    const data = doc.data();
    const uid = data.userId;
    
    if (!userNames[uid]) {
      const userSnap = await adminDb.collection('profiles').doc(uid).get();
      userNames[uid] = userSnap.data() || { name: 'Unknown User' };
    }

    const entry: LedgerEntry = {
      id: doc.id,
      userId: data.userId || '',
      type: data.type || 'SALE',
      ledgerType: data.ledgerType,
      refId: data.refId || '',
      debit: data.debit || 0,
      credit: data.credit || 0,
      balanceBefore: data.balanceBefore || 0,
      balanceAfter: data.balanceAfter || 0,
      availableCredit: data.availableCredit || 0,
      remarks: data.remarks || '',
      createdBy: data.createdBy || '',
      userName: userNames[uid].name,
      creditLimit: userNames[uid].creditLimit || 0,
      isVerified: data.isVerified,
      verifiedBy: data.verifiedBy,
      timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date().toISOString(),
      verifiedAt: data.verifiedAt?.toDate ? data.verifiedAt.toDate().toISOString() : undefined,
    };
    
    entries.push(entry);
  }

  return JSON.parse(JSON.stringify(entries));
}

export async function verifyLedgerEntry(entryId: string, refId?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'ACDEMA']);
  
  try {
    const entryRef = adminDb.collection('transactions').doc(entryId);
    const entrySnap = await entryRef.get();

    if (!entrySnap.exists) {
      return { success: false, error: 'Transaction not found' };
    }

    const entryData = entrySnap.data() as any;
    const customerId = entryData.userId;
    const isSale = entryData.type === 'SALE';
    const isReceipt = entryData.type === 'RECEIPT';
    const amount = isSale ? (entryData.debit || 0) : (entryData.credit || 0);

    // 1. Update the transaction itself
    if (entryData.isVerified) {
      return { success: true, message: 'Already verified' };
    }

    await entryRef.update({
      isVerified: true,
      verifiedBy: user.id,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Update Customer Lifetime Financials in Profile (Safely)
    if (customerId && amount > 0) {
      const profileRef = adminDb.collection('profiles').doc(customerId);
      const profileSnap = await profileRef.get();
      
      if (profileSnap.exists) {
        const currentData = profileSnap.data() as any;
        const currentSpend = currentData.membership?.totalSpend || 0;
        const currentUsedCredit = currentData.usedCredit || 0;
        const newSpend = isSale ? (currentSpend + amount) : currentSpend;
        
        // Tier Logic
        const getTier = (s: number) => {
          if (s >= 250000) return { tier: 'PLATINUM', nextAt: 0 };
          if (s >= 50000) return { tier: 'GOLD', nextAt: 250000 };
          return { tier: 'STANDARD', nextAt: 50000 };
        };
        const { tier, nextAt } = getTier(newSpend);

        if (isSale) {
          await profileRef.set({
            membership: {
              totalSpend: admin.firestore.FieldValue.increment(amount),
              tier,
              nextTierAt: nextAt
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } else if (isReceipt) {
          await profileRef.set({
            membership: {
              totalPayments: admin.firestore.FieldValue.increment(amount)
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } else {
        console.warn(`[verifyLedgerEntry] Profile not found for UID: ${customerId}. Skipping lifetime financial update.`);
      }
    }

    // 3. If there's a reference ID (Order ID), update the order's payment status and advance order life-cycle
    if (refId) {
      const orderRef = adminDb.collection('orders').doc(refId);
      const orderSnap = await orderRef.get();
      
      if (orderSnap.exists) {
        const orderData = orderSnap.data() as any;
        const snapshot = orderData.workflowSnapshot;
        const profileRef = customerId ? adminDb.collection('profiles').doc(customerId) : null;
        const profileSnapForReceipt = profileRef ? await profileRef.get() : null;
        const existingReceiptSnap = await adminDb.collection('transactions')
          .where('userId', '==', customerId)
          .where('refId', '==', refId)
          .where('type', '==', 'RECEIPT')
          .limit(1)
          .get();

        if (isSale && existingReceiptSnap.empty && amount > 0 && orderData.orderType === 'CREDIT') {
          const receiptId = `TX-REC-${Date.now()}`;
          const profileDataForReceipt = profileSnapForReceipt?.exists ? (profileSnapForReceipt.data() as any) : null;
          const balanceBefore = (profileDataForReceipt?.usedCredit || 0) || 0;
          const balanceAfter = Math.max(0, balanceBefore - amount);

          await adminDb.collection('transactions').doc(receiptId).set({
            userId: customerId,
            type: 'RECEIPT',
            ledgerType: orderData.orderType,
            refId,
            paymentId: refId,
            credit: amount,
            debit: 0,
            balanceBefore,
            balanceAfter,
            availableCredit: Math.max(0, (profileDataForReceipt?.creditLimit || 0) - balanceAfter),
            remarks: `Payment verified for Order ${refId}`,
            createdBy: user.id,
            isVerified: true,
            verifiedBy: user.id,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });

          if (profileRef) {
            await profileRef.set({
              usedCredit: admin.firestore.FieldValue.increment(-amount),
              membership: {
                totalPayments: admin.firestore.FieldValue.increment(amount)
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }
        }

        // Advance the workflowSnapshot to the next step after the accountant's step
        let currentWorkflowRole: string | null = orderData.currentWorkflowRole ?? null;
        let currentWorkflowLabel: string | null = orderData.currentWorkflowLabel ?? null;
        let updatedSnapshot = snapshot;
        let shouldUpdateOrder = true;

        if (snapshot && Array.isArray(snapshot.steps)) {
          const currentIdx = snapshot.currentStepIndex ?? 0;
          const steps = [...snapshot.steps];

          if (currentIdx < steps.length && steps[currentIdx].role === 'ACCOUNTANT') {
            // Mark current accountant step as COMPLETED
            steps[currentIdx] = {
              ...steps[currentIdx],
              status: 'COMPLETED',
              completedAt: new Date().toISOString(),
              completedBy: user.id,
            };

            const nextIdx = currentIdx + 1;
            if (nextIdx < steps.length) {
              steps[nextIdx] = { ...steps[nextIdx], status: 'PENDING' };
              currentWorkflowRole = steps[nextIdx].role;
              currentWorkflowLabel = steps[nextIdx].label;
              updatedSnapshot = { ...snapshot, steps, currentStepIndex: nextIdx };
            } else {
              // No next step — workflow done after accountant
              currentWorkflowRole = null;
              currentWorkflowLabel = 'COMPLETED';
              updatedSnapshot = { ...snapshot, steps };
            }
          } else {
            // Order is already past accountant step (e.g. credit order or already verified)
            shouldUpdateOrder = false;
          }
        }

        if (shouldUpdateOrder) {
          await orderRef.set({
            paymentStatus: 'VERIFIED',
            status: 'PAYMENT_VERIFIED', // RELEASE TO PRODUCTION
            workflowSnapshot: updatedSnapshot,
            currentWorkflowRole,
            currentWorkflowLabel,
            workflow: {
              paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
              paymentVerifiedBy: user.id,
            },
          }, { merge: true });

          // Sync paymentStatus to invoices table
          const invId = `INV-${refId.replace(/^ORD-/, '').replace(/-item\d+$/, '')}`;
          await adminDb.collection('invoices').doc(invId).update({
            paymentStatus: 'PAID',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }).catch(() => {});
        }

        // Keep the accountant payment queue in sync when verification happens from the global ledger.
        const relatedPaymentsSnap = await adminDb.collection('payments')
          .where('orderId', '==', refId)
          .where('status', '==', 'PENDING')
          .get();

        for (const paymentDoc of relatedPaymentsSnap.docs) {
          await paymentDoc.ref.update({
            status: 'APPROVED',
            approvedBy: user.id,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }

    // ── Audit Log ─────────────────────────────────────────────────────────────
    if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      const { writeAuditLog } = await import('@/lib/audit-log');
      await writeAuditLog({
        actedAs: 'ACCOUNTANT',
        actedAsType: 'ROLE',
        actionType: 'VERIFY_LEDGER',
        entityType: 'TRANSACTION',
        entityId: entryId,
        meta: { refId, amount, type: entryData.type }
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('verifyLedgerEntry error:', error);
    return { success: false, error: error.message };
  }
}

export interface CreditStatus {
  uid: string;
  name: string;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  authorizedBy: string;
}

export interface CustomerSummary {
  uid: string;
  name: string;
  phone?: string;
  customerType: 'CASH' | 'CREDIT';
  creditLimit: number;
  usedCredit: number; // Current system balance (includes adjustments)
  availableCredit: number;
  totalSpend: number;  // Total Orders (Sales Volume)
  totalPayments: number; // Total Verified Payments
  calculatedBalance: number; // Total Spend - Total Payments (Pure Sales Balance)
  lastOrderAt?: any;
  authorizedBy?: string;
}

export async function getCustomerLedgerSummaries() {
  await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);
  
  const profilesSnap = await adminDb.collection('profiles')
    .where('role', '==', 'CUSTOMER')
    .get();

  const adminNames: Record<string, string> = {};
  const customerProfiles: Record<string, any> = {};
  const summaries: CustomerSummary[] = [];

  for (const doc of profilesSnap.docs) {
    const data = doc.data();
    const adminUid = data.creditAuthorizedBy;

    if (adminUid && !adminNames[adminUid]) {
      const adminSnap = await adminDb.collection('profiles').doc(adminUid).get();
      adminNames[adminUid] = adminSnap.data()?.name || 'Admin';
    }

    customerProfiles[doc.id] = data;
    summaries.push({
      uid: doc.id,
      name: data.name || data.displayName || 'Unnamed',
      phone: data.phone || data.customerSnapshot?.phone,
      customerType: data.customerType || 'CASH',
      creditLimit: data.creditLimit || 0,
      usedCredit: data.usedCredit || 0,
      availableCredit: (data.creditLimit || 0) - (data.usedCredit || 0),
      totalSpend: data.membership?.totalSpend || 0,
      totalPayments: data.membership?.totalPayments || 0,
      calculatedBalance: (data.membership?.totalSpend || 0) - (data.membership?.totalPayments || 0),
      lastOrderAt: data.membership?.lastOrderAt || data.lastOrderAt || data.updatedAt,
      authorizedBy: adminUid ? adminNames[adminUid] : undefined
    });
  }

  const transactionSummary: Record<
    string,
    { totalSpend: number; totalPayments: number; lastOrderAt?: any }
  > = {};

  const txSnap = await adminDb.collection('transactions').get();
  const getMs = (value: any) => {
    if (!value) return 0;
    if (typeof value === 'object' && value.toMillis) return value.toMillis();
    if (typeof value === 'object' && value.seconds) return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return isNaN(parsed) ? 0 : parsed;
  };

  for (const txDoc of txSnap.docs) {
    const tx = txDoc.data() as any;
    const uid = tx.userId;
    if (!uid || !customerProfiles[uid]) continue;

    if (!transactionSummary[uid]) {
      transactionSummary[uid] = { totalSpend: 0, totalPayments: 0, lastOrderAt: undefined };
    }

    if (tx.type === 'SALE') {
      transactionSummary[uid].totalSpend += tx.debit || 0;
    }

    if (tx.type === 'RECEIPT' && tx.isVerified) {
      transactionSummary[uid].totalPayments += tx.credit || 0;
    }

    const timestamp = tx.timestamp || tx.createdAt;
    if (timestamp) {
      const currentMs = getMs(timestamp);
      const lastMs = getMs(transactionSummary[uid].lastOrderAt);
      if (!transactionSummary[uid].lastOrderAt || currentMs > lastMs) {
        transactionSummary[uid].lastOrderAt = timestamp;
      }
    }
  }

  const finalSummaries = summaries.map((summary) => {
    const txnSummary = transactionSummary[summary.uid];
    if (!txnSummary) return summary;

    const totalSpend = txnSummary.totalSpend;
    const totalPayments = txnSummary.totalPayments;
    const calculatedBalance = Math.max(0, totalSpend - totalPayments);

    return {
      ...summary,
      totalSpend,
      totalPayments,
      calculatedBalance,
      lastOrderAt: txnSummary.lastOrderAt || summary.lastOrderAt,
    };
  });

  return JSON.parse(JSON.stringify(finalSummaries));
}

/**
 * Migration: Backfill and Sync Customer Financials
 */
export async function migrateCustomerFinancials(dryRun = false) {
  console.log(`[Migration] Starting customer financial backfill (dryRun: ${dryRun})...`);
  
  try {
    const user = await getAuthorizedUser(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'ACDEMA']);

    // 1. Fetch all orders (we will filter cancelled/rejected in memory)
    const ordersSnap = await adminDb.collection('orders').get();

    // 2. Fetch all approved payments
    const paymentsSnap = await adminDb.collection('payments')
      .where('status', '==', 'APPROVED')
      .get();

    console.log(`[Migration] Found ${ordersSnap.size} total orders and ${paymentsSnap.size} approved payments.`);

    // 3. Group by customer
    const customerStats: Record<string, {
      totalSpend: number;
      totalPayments: number;
      totalOrders: number;
      highestOrder: number;
      firstOrder?: any;
      lastOrder?: any;
      customerType?: string;
    }> = {};

    const allProfilesSnap = await adminDb.collection('profiles').where('role', '==', 'CUSTOMER').get();
    allProfilesSnap.forEach(doc => {
      const data = doc.data();
      customerStats[doc.id] = {
        totalSpend: 0,
        totalPayments: 0,
        totalOrders: 0,
        highestOrder: 0,
        customerType: data.customerType || 'CASH'
      };
    });

    const getMs = (val: any) => {
      if (!val) return 0;
      if (typeof val === 'object' && val.toMillis) return val.toMillis();
      if (typeof val === 'object' && val.seconds) return val.seconds * 1000;
      return new Date(val).getTime();
    };

    // Process Orders
    ordersSnap.forEach(doc => {
      const data = doc.data() as any;
      const uid = data.customerId;
      const status = data.status;
      if (!uid || status === 'CANCELLED' || status === 'REJECTED') return;

      const amount = data.amounts?.grandTotal || 0;
      const date = data.createdAt;
      const dateMs = getMs(date);

      if (!customerStats[uid]) {
        customerStats[uid] = { 
          totalSpend: 0, 
          totalPayments: 0, 
          totalOrders: 0, 
          highestOrder: 0, 
          firstOrder: date, 
          lastOrder: date,
          customerType: data.orderType || 'CASH'
        };
      }

      const stats = customerStats[uid];
      stats.totalSpend += amount;
      stats.totalOrders += 1;
      if (amount > stats.highestOrder) stats.highestOrder = amount;
      if (date && stats.firstOrder && dateMs < getMs(stats.firstOrder)) stats.firstOrder = date;
      if (date && stats.lastOrder && dateMs > getMs(stats.lastOrder)) stats.lastOrder = date;
    });

    let backfilledReceipts = 0;
    let backfilledSales = 0;

    for (const doc of ordersSnap.docs) {
      const data = doc.data() as any;
      const uid = data.customerId;
      const amount = data.amounts?.grandTotal || 0;
      const status = data.status;

      if (!uid || amount <= 0 || status === 'CANCELLED' || status === 'REJECTED') continue;

      // Check and Backfill SALE
      const existingSaleSnap = await adminDb.collection('transactions')
        .where('userId', '==', uid)
        .where('refId', '==', doc.id)
        .where('type', '==', 'SALE')
        .limit(1)
        .get();

      if (existingSaleSnap.empty && !dryRun) {
        const txSaleId = `TX-SALE-${doc.id}-${Date.now()}`;
        await adminDb.collection('transactions').doc(txSaleId).set({
          userId: uid,
          type: 'SALE',
          ledgerType: data.orderType || 'CREDIT',
          refId: doc.id,
          debit: amount,
          credit: 0,
          balanceBefore: 0,
          balanceAfter: amount,
          availableCredit: 0,
          remarks: `Backfilled sale for Order ${doc.id}`,
          createdBy: user.id,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        backfilledSales += 1;
      }

      // Check and Backfill RECEIPT (only if verified)
      const isVerifiedOrder = data.paymentStatus === 'VERIFIED' || data.status === 'PAYMENT_VERIFIED' || data.createdByRole === 'ACDEMA';
      
      if (isVerifiedOrder) {
        const existingReceiptSnap = await adminDb.collection('transactions')
          .where('userId', '==', uid)
          .where('refId', '==', doc.id)
          .where('type', '==', 'RECEIPT')
          .limit(1)
          .get();

        if (existingReceiptSnap.empty && !dryRun) {
          const txId = `TX-REC-${doc.id}-${Date.now()}`;
          await adminDb.collection('transactions').doc(txId).set({
            userId: uid,
            type: 'RECEIPT',
            ledgerType: data.orderType || 'CREDIT',
            refId: doc.id,
            paymentId: doc.id,
            credit: amount,
            debit: 0,
            balanceBefore: amount,
            balanceAfter: 0,
            availableCredit: 0,
            remarks: `Backfilled verified payment for Order ${doc.id}`,
            createdBy: user.id,
            isVerified: true,
            verifiedBy: user.id,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
          backfilledReceipts += 1;
        }
      }
    }

    // Process Payments
    paymentsSnap.forEach(doc => {
      const data = doc.data() as any;
      const uid = data.userId;
      if (!uid) return;
      
      if (!customerStats[uid]) {
        customerStats[uid] = { totalSpend: 0, totalPayments: 0, totalOrders: 0, highestOrder: 0, customerType: 'CASH' };
      }
      
      customerStats[uid].totalPayments += (data.amount || 0);
    });

    const results: any[] = [];

    // Helper for Tier Logic
    const getTierInfo = (spend: number) => {
      if (spend >= 250000) return { tier: 'PLATINUM', nextTierAt: 0 };
      if (spend >= 50000) return { tier: 'GOLD', nextTierAt: 250000 };
      return { tier: 'STANDARD', nextTierAt: 50000 };
    };

    // 4. Update Profiles
    for (const [uid, stats] of Object.entries(customerStats)) {
      const { tier } = getTierInfo(stats.totalSpend);
      
      const updatePayload: any = {
        customerType: stats.customerType,
        gstType: 'Unregistered',
        voucherType: 'Type 0',
        creditStatus: 'APPROVED'
      };

      if (!dryRun) {
        await adminDb.collection('profiles').doc(uid).set({
          ...updatePayload,
          role: 'CUSTOMER' 
        }, { merge: true });
      }

      results.push({ uid, stats, updatePayload });
    }

    console.log(`[Migration] Successfully processed ${results.length} customers.`);
    return { 
      success: true, 
      processedCount: results.length,
      backfilledReceipts,
      dryRun,
    };
  } catch (error: any) {
    console.error("[Migration] Error:", error);
    return { success: false, error: error.message };
  }
}

export async function getOrderForLedger(orderId: string) {
  await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA']);

  const orderRef = adminDb.collection('orders').doc(orderId);
  const orderSnap: any = await orderRef.get();

  if (!(orderSnap as any).exists) return null;

  const orderData = (orderSnap as any).data();
  const itemsSnap: any = await orderRef.collection('items').get();
  const items = itemsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  return JSON.parse(JSON.stringify({
    ...orderData,
    items
  }));
}
