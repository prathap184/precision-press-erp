'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import * as admin from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { UserProfile, UserRole, getEffectiveRoles } from '@/types/auth';
import { supabaseServer } from '@/lib/supabase-server';
export async function getAuthorizedUser(allowedRoles: UserRole[]) {
  const token = cookies().get('token')?.value;
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

  return { 
    id: decoded.uid, 
    role: (profile?.role ?? claimedRole ?? 'CUSTOMER') as UserRole,
    name: profile?.name || 'Staff'
  };
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
    return { success: true, processedCount: results.length, backfilledReceipts, dryRun };
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

export async function createSaleEntry(customerId: string, orderIds: string[], totalAmount: number, remarks: string) {
  const authUser = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA', 'SUPER_ADMIN']);
  const saleEntryNumber = 'SALE-' + Date.now();
  const { data, error } = await supabaseServer.rpc('create_sale_entry', {
    p_sale_entry_number: saleEntryNumber,
    p_customer_id: customerId,
    p_order_ids: orderIds,
    p_total_amount: totalAmount,
    p_remarks: remarks,
    p_created_by: authUser.id
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Failed to create sale entry');
  return { success: true, saleEntryNumber };
}

export async function createReceiptEntry(
  customerId: string, 
  allocations: { orderId: string; amount: number }[], 
  amount: number, 
  paymentMode: string, 
  refNumber: string, 
  remarks: string,
  link?: string,
  cashLedger?: string,
  upiApp?: string,
  bankLedger?: string,
  bankName?: string,
  utr?: string
) {
  const authUserPromise = getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA', 'SUPER_ADMIN']);
  const countPromise = supabaseServer.from('transactions').select('*', { count: 'exact', head: true }).eq('type', 'RECEIPT');
  const [authUser, { count }] = await Promise.all([authUserPromise, countPromise]);
  
  const receiptEntryNumber = `REC-${(count || 0) + 1}`;
  const nowStr = new Date().toISOString();
  const dateStr = nowStr.split('T')[0];

  const agstRefOrderIds = allocations?.map(a => a.orderId).filter(Boolean) || [];
  let invoiceNumberForLink: string | null = null;
  let updateOrdersPromise: Promise<any> | null = null;

  if (agstRefOrderIds.length > 0) {
    updateOrdersPromise = supabaseServer.from('orders').update({
      receipt_created: true,
      receipt_entry_number: receiptEntryNumber
    }).in('id', agstRefOrderIds);

    const { data: orderData } = await supabaseServer.from('orders')
      .select('sale_entry_number')
      .in('id', agstRefOrderIds)
      .not('sale_entry_number', 'is', null)
      .limit(1);

    if (orderData && orderData.length > 0) {
      invoiceNumberForLink = orderData[0].sale_entry_number;
    } else {
      invoiceNumberForLink = agstRefOrderIds[0];
    }
  }

  const isCash = paymentMode?.toUpperCase() === 'CASH' || paymentMode?.toUpperCase() === 'HAND_CASH';
  const tasks: Promise<any>[] = [];

  if (updateOrdersPromise) tasks.push(updateOrdersPromise);

  tasks.push(
    updateTreasuryLedger({
      transactionType: 'RECEIPT',
      referenceId: receiptEntryNumber,
      amount: amount,
      mode: isCash ? 'CASH' : 'BANK',
      flow: 'IN',
      remarks: `Receipt from customer ${customerId}`,
      userId: authUser.id
    })
  );

  tasks.push(
    supabaseServer.from('tally_sync_queue').insert({
      id: `TSYNC-R-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`.toUpperCase(),
      syncType: 'RECEIPT_VOUCHER',
      customerId: customerId,
      idempotencyKey: `RECEIPT_VOUCHER::${receiptEntryNumber}`,
      status: 'PENDING',
      payload: {
        receiptEntryNumber, customerId, totalAmount: amount, paymentMode,
        refNumber, remarks, allocations, type: 'RECEIPT', voucherDate: dateStr
      }
    })
  );

  const refIdStr = invoiceNumberForLink ? invoiceNumberForLink : receiptEntryNumber;

  const { data: customerProfile } = await supabaseServer.from('contact').select('used_credit, credit_limit').eq('id', customerId).single();
  const balanceBefore = Number(customerProfile?.used_credit || 0);
  const balanceAfter = Math.max(0, balanceBefore - amount);
  const availableCredit = Math.max(0, Number(customerProfile?.credit_limit || 0) - balanceAfter);

  tasks.push(
    supabaseServer.from('transactions').insert({
      id: receiptEntryNumber, type: 'RECEIPT', ledgerType: isCash ? 'CASH' : 'BANK',
      userId: customerId, credit: amount, debit: 0, 
      balanceBefore, balanceAfter, availableCredit,
      timestamp: nowStr,
      isVerified: true, refId: refIdStr, paymentId: refNumber,
      paymentMode: paymentMode, remarks: remarks,
      receipt_entry_number: receiptEntryNumber, sale_entry_number: invoiceNumberForLink,
      link: invoiceNumberForLink, createdBy: authUser.name,
      verifiedBy: authUser.name,
      verifiedAt: { timestamp: nowStr, role: authUser.role, name: authUser.name },
      cash_ledger: cashLedger, upi_app: upiApp, bank_ledger: bankLedger,
      bank_name: bankName, utr: utr
    })
  );

  tasks.push(
    supabaseServer.from('contact').update({
      used_credit: balanceAfter
    }).eq('id', customerId)
  );

  tasks.push(
    supabaseServer.from('receipt_entries').insert({
      id: receiptEntryNumber, userid: customerId, refid: refIdStr,
      credit: amount, createdby: authUser.name, timestamp: nowStr,
      isverified: true,
      verifiedat: { timestamp: nowStr, role: authUser.role, name: authUser.name },
      paymentmode: paymentMode, is_synced_to_erp: false,
      sale_entry_number: invoiceNumberForLink, receipt_entry_number: receiptEntryNumber,
      link: invoiceNumberForLink, cash_ledger: cashLedger, upi_app: upiApp,
      bank_ledger: bankLedger, bank_name: bankName, utr: utr
    })
  );

  if (isCash) {
    tasks.push((async () => {
      const ledgerName = cashLedger || 'Cash';
      const { data: lastCash } = await supabaseServer.from('company_cash_ledger')
        .select('balance_after').eq('cash_ledger_name', ledgerName)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const balBefore = Number(lastCash?.balance_after || 0);
      return supabaseServer.from('company_cash_ledger').insert({
        entry_date: dateStr, cash_ledger_name: ledgerName, type: 'IN',
        amount: amount, balance_before: balBefore, balance_after: balBefore + amount,
        transaction_type: 'RECEIPT', ref_id: receiptEntryNumber,
        narration: `Receipt from customer | ${remarks || ''}`, created_by: authUser.name
      });
    })());
  } else {
    tasks.push((async () => {
      const ledgerName = bankLedger || bankName || 'Bank';
      const { data: lastBank } = await supabaseServer.from('company_bank_ledger')
        .select('balance_after').eq('bank_ledger_name', ledgerName)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const balBefore = Number(lastBank?.balance_after || 0);
      return supabaseServer.from('company_bank_ledger').insert({
        entry_date: dateStr, bank_ledger_name: ledgerName, type: 'IN',
        amount: amount, balance_before: balBefore, balance_after: balBefore + amount,
        transaction_type: 'RECEIPT', ref_id: receiptEntryNumber,
        narration: `Receipt from customer | ${remarks || ''}`, created_by: authUser.name
      });
    })());
  }

  // Update company full details
  tasks.push(
    supabaseServer.from('company_full_details').insert({
      company_name: 'Hindustan Enterprises',
      cash_amount: isCash ? amount : 0,
      bank_amount: !isCash ? amount : 0,
      status: 'NEW',
      transaction_type: 'RECEIPT',
      transaction_type_ref: receiptEntryNumber,
      created_by: authUser.id
    })
  );

  const results = await Promise.all(tasks);

  for (const res of results) {
    if (res && res.error) {
      console.error('Error inserting receipt data:', res.error);
      throw new Error(`Receipt entry failed: ${res.error.message || JSON.stringify(res.error)}`);
    }
  }

  revalidatePath('/', 'layout');
  return { success: true, receiptEntryNumber };
}

export async function createPaymentEntry(
  supplierId: string, 
  allocations: any[], 
  amount: number, 
  paymentMode: string, 
  refNumber: string, 
  remarks: string,
  link?: string,
  paymentDate?: string,
  cashLedger?: string,
  upiApp?: string,
  bankLedger?: string,
  bankName?: string,
  utr?: string,
  paymentCategory: string = 'Supplier',
  fullDetails: string = ''
) {
  const authUserPromise = getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA', 'SUPER_ADMIN']);
  const countPromise = supabaseServer.from('payment_entries').select('*', { count: 'exact', head: true });
  const [authUser, { count }] = await Promise.all([authUserPromise, countPromise]);
  
  const paymentEntryNumber = `PAY-${(count || 0) + 1}`;
  const paymentId = crypto.randomUUID();
  const nowStr = new Date().toISOString();
  const dateStr = paymentDate || nowStr.split('T')[0];
  const isCashPay = paymentMode?.toUpperCase() === 'CASH';

  const tasks: Promise<any>[] = [];

  const agstRefOrderIds = paymentCategory === 'Supplier' 
    ? allocations?.map(a => a.orderId).filter(Boolean) || []
    : [];

  if (agstRefOrderIds.length > 0) {
    tasks.push(
      supabaseServer.from('orders').update({
        payment_created: true,
        payment_entry_number: paymentEntryNumber
      }).in('id', agstRefOrderIds)
    );
  }

  tasks.push(
    supabaseServer.from('payment_entries').insert({
      id: paymentId, payment_number: paymentEntryNumber, supplier_id: supplierId || null,
      amount: amount, payment_mode: paymentMode, ref_number: refNumber,
      remarks: remarks, payment_date: dateStr, created_by: authUser.id,
      allocations: allocations, status: 'VERIFIED', cash_ledger: cashLedger || null,
      upi_app: upiApp || null, bank_ledger: bankLedger || null,
      bank_name: bankName || null, utr: utr || null,
      payment_category: paymentCategory, full_details: fullDetails
    })
  );

  tasks.push(
    supabaseServer.from('transactions').insert({
      id: paymentEntryNumber, userId: supplierId || null, type: 'PAYMENT',
      ledgerType: 'PAYMENT', refId: paymentEntryNumber, debit: amount,
      credit: 0, balanceBefore: null, balanceAfter: null, availableCredit: null,
      remarks: remarks, createdBy: authUser.name, timestamp: nowStr,
      isVerified: true, verifiedAt: { timestamp: nowStr, role: authUser.role, name: authUser.name },
      verifiedBy: authUser.name, approvedBy: null, paymentId: refNumber || null,
      paymentMode: paymentMode, is_synced_to_erp: false, sale_entry_number: null,
      receipt_entry_number: paymentEntryNumber, link: link || null,
      cash_ledger: cashLedger || null, upi_app: upiApp || null,
      bank_ledger: bankLedger || null, bank_name: bankName || null, utr: utr || null
    })
  );

  tasks.push(
    updateTreasuryLedger({
      transactionType: 'PAYMENT', referenceId: paymentId, amount: amount,
      mode: isCashPay ? 'CASH' : 'BANK', flow: 'OUT',
      remarks: `Payment to ${paymentCategory === 'Supplier' ? 'supplier' : paymentCategory} ${supplierId || ''}`, userId: authUser.id
    })
  );

  tasks.push(
    supabaseServer.from('tally_sync_queue').insert({
      id: `TSYNC-P-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`.toUpperCase(),
      syncType: 'PAYMENT_VOUCHER', paymentId: paymentId,
      idempotencyKey: `PAYMENT_VOUCHER::${paymentId}`, status: 'PENDING',
      payload: {
        paymentEntryNumber, supplierId, totalAmount: amount, paymentMode,
        refNumber, remarks, allocations, type: 'PAYMENT', voucherDate: nowStr.split('T')[0]
      }
    })
  );

  if (isCashPay) {
    tasks.push((async () => {
      const ledgerName = cashLedger || 'Cash';
      const { data: lastCash } = await supabaseServer.from('company_cash_ledger')
        .select('balance_after').eq('cash_ledger_name', ledgerName)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const balBefore = Number(lastCash?.balance_after || 0);
      return supabaseServer.from('company_cash_ledger').insert({
        entry_date: nowStr.split('T')[0], cash_ledger_name: ledgerName, type: 'OUT',
        amount: amount, balance_before: balBefore, balance_after: Math.max(0, balBefore - amount),
        transaction_type: 'PAYMENT', ref_id: paymentEntryNumber,
        narration: `Payment (${paymentCategory}) | ${remarks || ''}`, created_by: authUser.name
      });
    })());
  } else {
    tasks.push((async () => {
      const ledgerName = bankLedger || bankName || 'Bank';
      const { data: lastBank } = await supabaseServer.from('company_bank_ledger')
        .select('balance_after').eq('bank_ledger_name', ledgerName)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const balBefore = Number(lastBank?.balance_after || 0);
      return supabaseServer.from('company_bank_ledger').insert({
        entry_date: nowStr.split('T')[0], bank_ledger_name: ledgerName, type: 'OUT',
        amount: amount, balance_before: balBefore, balance_after: Math.max(0, balBefore - amount),
        transaction_type: 'PAYMENT', ref_id: paymentEntryNumber,
        narration: `Payment (${paymentCategory}) | ${remarks || ''}`, created_by: authUser.name
      });
    })());
  }

  await Promise.all(tasks);

  revalidatePath('/', 'layout');
  return { success: true, paymentEntryNumber };
}
export async function createJournalEntry(
  fromId: string, 
  toId: string, 
  amount: number, 
  remarks: string,
  journalDate?: string,
  orderId?: string
) {
  const authUser = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA', 'SUPER_ADMIN']);
  const journalEntryNumber = 'JRNL-' + Date.now();
  const journalId = crypto.randomUUID();

  // 1. Insert into journal_entries table
  const { error: txErr } = await supabaseServer.from('journal_entries').insert({
    id: journalId,
    journal_number: journalEntryNumber,
    source_customer_id: fromId,
    target_customer_id: toId,
    amount: amount,
    remarks: remarks,
    created_by: authUser.id,
    journal_date: journalDate || new Date().toISOString().split('T')[0],
    ref_order_id: orderId || null,
    status: 'VERIFIED'
  });

  if (txErr) throw new Error(txErr.message);

  // Fetch names for Tally XML
  let fromLedger = 'Unknown';
  let toLedger = 'Unknown';
  try {
    const { data: profiles } = await supabaseServer
      .from('contact')
      .select('id, name, business_name')
      .in('id', [fromId, toId]);
    if (profiles) {
      const fromP = profiles.find(p => p.id === fromId);
      const toP = profiles.find(p => p.id === toId);
      if (fromP) fromLedger = (fromP as any).business_name || fromP.name || fromId;
      if (toP) toLedger = (toP as any).business_name || toP.name || toId;
    }
  } catch (e) {}

  // 2. Queue for Tally Push
  try {
    const { enqueueTallySync } = await import('./tally-sync');
    await enqueueTallySync({
      syncType: 'JOURNAL_ENTRY',
      orderId: journalId,
      customerId: fromId || 'system',
      createdBy: authUser.id,
      voucherId: journalEntryNumber,
      voucherType: 'Journal',
      refId: journalEntryNumber,
      amountSnap: { amount: amount, type: 'JOURNAL' },
      payload: {
        journalEntryNumber,
        voucherNumber: journalEntryNumber,
        fromCustomerId: fromId,
        toCustomerId: toId,
        totalAmount: amount,
        amount: amount,
        remarks,
        voucherDate: journalDate || new Date().toISOString().split('T')[0],
        type: 'JOURNAL',
        entries: [
          { ledgerName: fromLedger, amount: amount, isDebit: false },
          { ledgerName: toLedger, amount: amount, isDebit: true }
        ]
      }
    });
  } catch (syncErr: any) {
    console.warn('[createJournalEntry] Failed to enqueue Tally sync:', syncErr.message);
  }

  // 3. Insert into transactions table (Double Entry for General Ledger)
  const txDate = new Date().toISOString();
  
  // Credit leg (Source / Giver)
  const { error: txCredErr } = await supabaseServer.from('transactions').insert({
    id: journalEntryNumber + '-CR',
    userId: fromId,
    type: 'JOURNAL',
    ledgerType: 'JOURNAL',
    debit: 0,
    credit: amount,
    remarks: remarks,
    createdBy: authUser.name,
    timestamp: txDate,
    isVerified: true,
    refId: journalEntryNumber,
    paymentMode: 'JOURNAL'
  });
  if (txCredErr) console.warn('[createJournalEntry] Failed to insert Credit leg into transactions:', txCredErr.message);

  // Debit leg (Target / Receiver)
  const { error: txDebErr } = await supabaseServer.from('transactions').insert({
    id: journalEntryNumber + '-DR',
    userId: toId,
    type: 'JOURNAL',
    ledgerType: 'JOURNAL',
    debit: amount,
    credit: 0,
    remarks: remarks,
    createdBy: authUser.name,
    timestamp: txDate,
    isVerified: true,
    refId: journalEntryNumber,
    paymentMode: 'JOURNAL'
  });
  if (txDebErr) console.warn('[createJournalEntry] Failed to insert Debit leg into transactions:', txDebErr.message);

  return { success: true, journalEntryNumber };
}

export async function createContraEntry(
  transferType: 'CASH_TO_BANK' | 'BANK_TO_CASH', 
  amount: number, 
  remarks: string,
  contraDate?: string
) {
  const authUser = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'ACDEMA', 'SUPER_ADMIN']);
  const contraEntryNumber = 'CONT-' + Date.now();
  const contraId = crypto.randomUUID();

  // 1. Insert into contra_entries table
  const source_ledger = transferType === 'CASH_TO_BANK' ? 'Cash' : 'Bank';
  const target_ledger = transferType === 'CASH_TO_BANK' ? 'Bank' : 'Cash';
  const { error: txErr } = await supabaseServer.from('contra_entries').insert({
    id: contraId,
    contra_number: contraEntryNumber,
    source_ledger,
    target_ledger,
    amount: amount,
    remarks: remarks,
    created_by: authUser.id,
    contra_date: contraDate || new Date().toISOString().split('T')[0],
    status: 'VERIFIED'
  });

  if (txErr) throw new Error(txErr.message);

  // 1.b. Update Treasury Ledger for Contra
  await updateTreasuryLedger({
    transactionType: 'CONTRA',
    referenceId: contraId,
    amount: amount,
    mode: 'CONTRA',
    flow: transferType === 'CASH_TO_BANK' ? 'CASH_TO_BANK' : 'BANK_TO_CASH',
    remarks: remarks,
    userId: authUser.id
  });

  // Fetch previous balances
  const { data: lastCash } = await supabaseServer.from('company_cash_ledger')
    .select('balance_after, cash_ledger_name')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  
  const { data: lastBank } = await supabaseServer.from('company_bank_ledger')
    .select('balance_after, bank_ledger_name')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const balBeforeCash = Number(lastCash?.balance_after || 0);
  const cashLedgerName = lastCash?.cash_ledger_name || (transferType === 'CASH_TO_BANK' ? source_ledger : target_ledger);

  const balBeforeBank = Number(lastBank?.balance_after || 0);
  const bankLedgerName = lastBank?.bank_ledger_name || (transferType === 'CASH_TO_BANK' ? target_ledger : source_ledger);

  const dateStr = contraDate || new Date().toISOString().split('T')[0];

  if (transferType === 'CASH_TO_BANK') {
    await Promise.all([
      supabaseServer.from('company_cash_ledger').insert({
        entry_date: dateStr, cash_ledger_name: cashLedgerName, type: 'OUT',
        amount: amount, balance_before: balBeforeCash, balance_after: Math.max(0, balBeforeCash - amount),
        transaction_type: 'CONTRA', ref_id: contraEntryNumber,
        narration: `Contra | ${remarks || ''}`, created_by: authUser.name || authUser.id
      }),
      supabaseServer.from('company_bank_ledger').insert({
        entry_date: dateStr, bank_ledger_name: bankLedgerName, type: 'IN',
        amount: amount, balance_before: balBeforeBank, balance_after: balBeforeBank + amount,
        transaction_type: 'CONTRA', ref_id: contraEntryNumber,
        narration: `Contra | ${remarks || ''}`, created_by: authUser.name || authUser.id
      })
    ]);
  } else {
    // BANK_TO_CASH
    await Promise.all([
      supabaseServer.from('company_bank_ledger').insert({
        entry_date: dateStr, bank_ledger_name: bankLedgerName, type: 'OUT',
        amount: amount, balance_before: balBeforeBank, balance_after: Math.max(0, balBeforeBank - amount),
        transaction_type: 'CONTRA', ref_id: contraEntryNumber,
        narration: `Contra | ${remarks || ''}`, created_by: authUser.name || authUser.id
      }),
      supabaseServer.from('company_cash_ledger').insert({
        entry_date: dateStr, cash_ledger_name: cashLedgerName, type: 'IN',
        amount: amount, balance_before: balBeforeCash, balance_after: balBeforeCash + amount,
        transaction_type: 'CONTRA', ref_id: contraEntryNumber,
        narration: `Contra | ${remarks || ''}`, created_by: authUser.name || authUser.id
      })
    ]);
  }

  // 1.c. Insert into transactions table
  const txDate = contraDate ? `${contraDate}T00:00:00.000Z` : new Date().toISOString();
  await supabaseServer.from('transactions').insert([
    {
      id: contraEntryNumber + '-BANK',
      type: 'CONTRA',
      ledgerType: 'CONTRA',
      debit: transferType === 'BANK_TO_CASH' ? amount : 0,
      credit: transferType === 'CASH_TO_BANK' ? amount : 0,
      timestamp: txDate,
      isVerified: true,
      refId: contraEntryNumber,
      paymentMode: transferType,
      remarks: remarks,
      createdBy: authUser.name || authUser.id,
      verifiedBy: authUser.name || authUser.id,
      bank_ledger: bankLedgerName
    },
    {
      id: contraEntryNumber + '-CASH',
      type: 'CONTRA',
      ledgerType: 'CONTRA',
      debit: transferType === 'CASH_TO_BANK' ? amount : 0,
      credit: transferType === 'BANK_TO_CASH' ? amount : 0,
      timestamp: txDate,
      isVerified: true,
      refId: contraEntryNumber,
      paymentMode: transferType,
      remarks: remarks,
      createdBy: authUser.name || authUser.id,
      verifiedBy: authUser.name || authUser.id,
      cash_ledger: cashLedgerName
    }
  ]);

  // 2. Queue for Tally Push
  try {
    const { enqueueTallySync } = await import('./tally-sync');
    await enqueueTallySync({
      syncType: 'CONTRA_ENTRY',
      orderId: contraId,
      customerId: 'system',
      createdBy: authUser.id,
      voucherId: contraEntryNumber,
      voucherType: 'Contra',
      refId: contraEntryNumber,
      amountSnap: { amount, type: transferType },
      payload: {
        contraEntryNumber,
        voucherNumber: contraEntryNumber,
        transferType,
        amount: amount,
        remarks,
        voucherDate: contraDate || new Date().toISOString().split('T')[0],
        fromLedgerName: source_ledger,
        toLedgerName: target_ledger,
        type: 'CONTRA'
      }
    });
  } catch (syncErr: any) {
    console.warn('[createContraEntry] Failed to enqueue Tally sync:', syncErr.message);
  }

  return { success: true, contraEntryNumber };
}

// =====================================
// TREASURY HELPERS
// =====================================

export async function updateTreasuryLedger({
  transactionType,
  referenceId,
  amount,
  mode,
  flow,
  remarks,
  userId
}: {
  transactionType: string;
  referenceId: string;
  amount: number;
  mode: 'CASH' | 'BANK' | 'CONTRA';
  flow: 'IN' | 'OUT' | 'CASH_TO_BANK' | 'BANK_TO_CASH';
  remarks: string;
  userId: string;
}) {
  // 1. Fetch current 'NEW' status company details
  const { data: currentCompany, error: fetchErr } = await supabaseServer
    .from('company_full_details')
    .select('*')
    .eq('status', 'NEW')
    .limit(1)
    .single();

  if (fetchErr && fetchErr.code !== 'PGRST116') { // PGRST116 is not found
    console.error('Error fetching company details', fetchErr);
    throw new Error('Failed to fetch treasury balance');
  }

  const companyId = currentCompany?.id;
  const currentCash = parseFloat(currentCompany?.cash_amount || '0');
  const currentBank = parseFloat(currentCompany?.bank_amount || '0');

  // 2. Mark existing as 'OLD' if exists
  if (companyId) {
    await supabaseServer
      .from('company_full_details')
      .update({ status: 'OLD' })
      .eq('id', companyId);
  }

  let newCash = currentCash;
  let newBank = currentBank;
  
  let cashDebit = 0, cashCredit = 0;
  let bankDebit = 0, bankCredit = 0;

  if (mode === 'CASH') {
    if (flow === 'IN') { newCash += amount; cashDebit = amount; }
    else if (flow === 'OUT') { newCash -= amount; cashCredit = amount; }
  } else if (mode === 'BANK') {
    if (flow === 'IN') { newBank += amount; bankDebit = amount; }
    else if (flow === 'OUT') { newBank -= amount; bankCredit = amount; }
  } else if (mode === 'CONTRA') {
    if (flow === 'CASH_TO_BANK') {
      newCash -= amount; cashCredit = amount;
      newBank += amount; bankDebit = amount;
    } else if (flow === 'BANK_TO_CASH') {
      newBank -= amount; bankCredit = amount;
      newCash += amount; cashDebit = amount;
    }
  }

  // 3. Insert NEW company details
  const { error: insertErr } = await supabaseServer
    .from('company_full_details')
    .insert({
      company_name: currentCompany?.company_name || 'Hindustan Enterprises',
      cash_amount: newCash,
      bank_amount: newBank,
      status: 'NEW',
      transaction_type: transactionType,
      transaction_type_ref: referenceId,
      created_by: userId
    });

  if (insertErr) throw new Error('Failed to insert new treasury balance');

  // 4. Update Ledgers
  if (cashDebit > 0 || cashCredit > 0) {
    await supabaseServer.from('hand_cash_ledger').insert({
      company_id: companyId,
      transaction_type: transactionType,
      reference_id: referenceId,
      debit: cashDebit,
      credit: cashCredit,
      balance_before: currentCash,
      balance_after: newCash,
      remarks: remarks,
      created_by: userId
    });
  }

  if (bankDebit > 0 || bankCredit > 0) {
    await supabaseServer.from('bank_amount_ledger').insert({
      company_id: companyId,
      transaction_type: transactionType,
      reference_id: referenceId,
      debit: bankDebit,
      credit: bankCredit,
      balance_before: currentBank,
      balance_after: newBank,
      remarks: remarks,
      created_by: userId
    });
  }
}
