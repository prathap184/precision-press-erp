'use server';

import { adminDb } from '@/lib/firebase-admin';
import * as admin from '@/lib/firebase-admin';
import { GlobalStats } from '@/types/stats';

/**
 * Incrementally update stats in a transaction.
 * Uses dot-notation for nested updates.
 */
export async function updateStatsIncrementally(
  transaction: admin.firestore.Transaction,
  updates: Record<string, number>
) {
  const globalRef = adminDb.collection('stats').doc('global');
  const globalSnap = await transaction.get(globalRef);

  if (!(globalSnap as any).exists) {
    const initialStats: GlobalStats = {
      financial: { totalSales: 0, totalReceipts: 0, totalPendingVerification: 0, totalUnpaid: 0, totalOutstanding: 0, totalCreditExposure: 0 },
      orders: { total: 0, placed: 0, paymentPending: 0, verified: 0, assigned: 0, inProgress: 0, completed: 0, dispatched: 0, cancelled: 0 },
      production: { activeJobs: 0, completedJobs: 0, jobsPerPrinter: {} },
      payments: { pending: 0, approved: 0, rejected: 0 },
      dispatch: { pending: 0, completed: 0 },
      system: { lastUpdated: admin.firestore.FieldValue.serverTimestamp() }
    };
    transaction.set(globalRef, initialStats);
  }

  const updateData: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    updateData[key] = admin.firestore.FieldValue.increment(value);
  }
  
  updateData['system.lastUpdated'] = admin.firestore.FieldValue.serverTimestamp();
  transaction.update(globalRef, updateData);
}

/**
 * Perform a full recalculation of all metrics by scanning collections.
 */
export async function recalculateGlobalStats() {
  console.log("[Stats Engine] Starting full aggregation...");
  
  try {
    const stats: GlobalStats = {
      financial: {
        totalSales: 0,
        totalReceipts: 0,
        totalPendingVerification: 0,
        totalUnpaid: 0,
        totalOutstanding: 0,
        totalCreditExposure: 0
      },
      orders: {
        total: 0,
        placed: 0,
        paymentPending: 0,
        verified: 0,
        assigned: 0,
        inProgress: 0,
        completed: 0,
        dispatched: 0,
        cancelled: 0
      },
      production: {
        activeJobs: 0,
        completedJobs: 0,
        jobsPerPrinter: {}
      },
      payments: {
        pending: 0,
        approved: 0,
        rejected: 0
      },
      dispatch: {
        pending: 0,
        completed: 0
      },
      system: {
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      }
    };

    const acdemaOrderIds = new Set<string>();
    const ordersSnap = await adminDb.collection('orders').get();
    ordersSnap.forEach(doc => {
      const data = doc.data();
      
      // Skip child orders to prevent double counting
      if (doc.id.includes('-item')) return;

      const status = data.status;
      const grandTotal = Number(data.amounts?.grandTotal || 0);

      stats.orders.total++;
      if (status === 'PLACED') stats.orders.placed++;
      else if (status === 'PAYMENT_PENDING') stats.orders.paymentPending++;
      else if (['PAYMENT_VERIFIED', 'VERIFIED'].includes(status)) stats.orders.verified++;
      else if (status === 'ASSIGNED') stats.orders.assigned++;
      else if (status === 'IN_PROGRESS') stats.orders.inProgress++;
      else if (status === 'COMPLETED' || status === 'DELIVERED') stats.orders.completed++;
      else if (status === 'DISPATCHED') stats.orders.dispatched++;
      else if (status === 'CANCELLED') stats.orders.cancelled++;

      if (status !== 'CANCELLED') {
        stats.financial.totalSales += grandTotal;
        if (data.createdByRole === 'ACDEMA') {
          stats.financial.totalReceipts += grandTotal;
          acdemaOrderIds.add(doc.id);
        }
      }
    });

    const paymentsSnap = await adminDb.collection('payments').get();
    paymentsSnap.forEach(doc => {
      const data = doc.data();
      
      // Skip payments for ACDEMA proxy orders, as their full grandTotal is already counted as receipted.
      if (acdemaOrderIds.has(data.orderId) || (Array.isArray(data.orderIds) && data.orderIds.some((id: string) => acdemaOrderIds.has(id)))) {
        return;
      }

      const status = data.status;
      const amount = Number(data.amount || 0);

      // We still count them in payments count, but we exclude GENERAL payments (credit top-ups) from financial totals as requested by the user
      if (status === 'APPROVED') {
        stats.payments.approved++;
        if (data.orderId !== 'GENERAL') {
          stats.financial.totalReceipts += amount;
        }
      } else if (status === 'REJECTED') {
        stats.payments.rejected++;
      } else {
        stats.payments.pending++;
        if (data.orderId !== 'GENERAL') {
          stats.financial.totalPendingVerification += amount;
        }
      }
    });

    const creditPendingSnap = await adminDb
      .collection('orders')
      .where('orderType', '==', 'CREDIT')
      .where('paymentStatus', '==', 'PENDING')
      .get();

    creditPendingSnap.forEach(doc => {
      const data = doc.data();
      stats.financial.totalPendingVerification += Number(data.amounts?.grandTotal || 0);
    });

    const jobsSnap = await adminDb.collection('jobs').get();
    jobsSnap.forEach(doc => {
      const data = doc.data();
      const status = data.status;
      const printer = data.printerId || 'unknown';

      if (['QUEUED', 'IN_PROGRESS', 'HOLD'].includes(status)) {
        stats.production.activeJobs++;
      } else if (status === 'COMPLETED') {
        stats.production.completedJobs++;
      }

      if (!stats.production.jobsPerPrinter[printer]) {
        stats.production.jobsPerPrinter[printer] = 0;
      }
      stats.production.jobsPerPrinter[printer]++;
    });

    const profilesSnap = await adminDb.collection('profiles').get();
    profilesSnap.forEach(doc => {
      const data = doc.data();
      stats.financial.totalOutstanding += Number(data.usedCredit || 0);
      stats.financial.totalCreditExposure += Number(data.creditLimit || 0);
    });

    stats.financial.totalUnpaid = Math.max(0, stats.financial.totalSales - stats.financial.totalReceipts - stats.financial.totalPendingVerification);

    await adminDb.collection('stats').doc('global').set(stats);
    
    return { success: true, stats: JSON.parse(JSON.stringify(stats)) };
  } catch (error: any) {
    console.error("[Stats Engine] Recalculation failed:", error);
    return { success: false, error: error.message };
  }
}
