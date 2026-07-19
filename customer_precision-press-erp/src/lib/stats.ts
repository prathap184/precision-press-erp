// @ts-nocheck
'use server';

import { adminDb } from './firebase-admin';
import * as admin from '@/lib/firebase-admin';

export interface GlobalStats {
  financial: {
    totalSales: number;
    totalReceipts: number;
    totalPendingVerification: number;
    totalUnpaid: number;
    totalOutstanding: number;
    totalCreditExposure: number;
  };
  orders: {
    total: number;
    placed: number;
    paymentPending: number;
    verified: number;
    assigned: number;
    inProgress: number;
    completed: number;
    dispatched: number;
    cancelled: number;
  };
  production: {
    activeJobs: number;
    completedJobs: number;
    jobsPerPrinter: Record<string, number>;
  };
  payments: {
    pending: number;
    approved: number;
    rejected: number;
  };
  dispatch: {
    pending: number;
    completed: number;
  };
  lastUpdated?: any;
  system?: {
    lastUpdated: any;
  };
}

/**
 * Incrementally update stats in a transaction.
 * Uses dot-notation for nested updates.
 */
export async function updateStatsIncrementally(
  transaction: admin.firestore.Transaction | null,
  updates: Record<string, number>
) {
  const globalRef = adminDb.collection('stats').doc('global');
  
  const initialStats: GlobalStats = {
    financial: { totalSales: 0, totalReceipts: 0, totalPendingVerification: 0, totalUnpaid: 0, totalOutstanding: 0, totalCreditExposure: 0 },
    orders: { total: 0, placed: 0, paymentPending: 0, verified: 0, assigned: 0, inProgress: 0, completed: 0, dispatched: 0, cancelled: 0 },
    production: { activeJobs: 0, completedJobs: 0, jobsPerPrinter: {} },
    payments: { pending: 0, approved: 0, rejected: 0 },
    dispatch: { pending: 0, completed: 0 },
    system: { lastUpdated: admin.firestore.FieldValue.serverTimestamp() }
  };

  const updateData: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    updateData[key] = admin.firestore.FieldValue.increment(value);
  }
  updateData['system.lastUpdated'] = admin.firestore.FieldValue.serverTimestamp();

  if (transaction) {
    const globalSnap = await transaction.get(globalRef);
    if (!(globalSnap as any).exists) {
      transaction.set(globalRef, initialStats);
    }
    transaction.update(globalRef, updateData);
  } else {
    const globalSnap = await globalRef.get();
    if (!globalSnap.exists) {
      await globalRef.set(initialStats);
    }
    await globalRef.update(updateData);
  }
}

/**
 * Perform a full recalculation of all metrics by scanning collections.
 * Use this for recovery or scheduled maintenance.
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

    // 1. Aggregate Orders
    const ordersSnap = await adminDb.collection('orders').get();
    console.log(`[Stats Engine] Found ${ordersSnap.size} orders.`);
    
    ordersSnap.forEach(doc => {
      const data = doc.data();
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

      // Financials - Count all non-cancelled orders as sales for revenue tracking
      if (status !== 'CANCELLED') {
        stats.financial.totalSales += grandTotal;
      }
    });

    // 2. Aggregate Payments
    const paymentsSnap = await adminDb.collection('payments').get();
    console.log(`[Stats Engine] Found ${paymentsSnap.size} payments.`);
    
    paymentsSnap.forEach(doc => {
      const data = doc.data();
      const status = data.status;
      const amount = Number(data.amount || 0);

      if (status === 'APPROVED') {
        stats.payments.approved++;
        stats.financial.totalReceipts += amount;
      } else if (status === 'REJECTED') {
        stats.payments.rejected++;
      } else {
        stats.payments.pending++;
        stats.financial.totalPendingVerification += amount;
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

    // 3. Aggregate Production Jobs
    const jobsSnap = await adminDb.collection('jobs').get();
    console.log(`[Stats Engine] Found ${jobsSnap.size} jobs.`);
    
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

    // 4. Aggregate Outstanding from Profiles (More accurate than Order-Payment diff)
    const profilesSnap = await adminDb.collection('profiles').get();
    profilesSnap.forEach(doc => {
      const data = doc.data();
      stats.financial.totalOutstanding += Number(data.usedCredit || 0);
      stats.financial.totalCreditExposure += Number(data.creditLimit || 0);
    });

    stats.financial.totalUnpaid = Math.max(0, stats.financial.totalSales - stats.financial.totalReceipts - stats.financial.totalPendingVerification);

    // 5. Save to Firestore
    await adminDb.collection('stats').doc('global').set(stats);
    console.log("[Stats Engine] Aggregation complete:", stats);
    
    // Return a plain object to the client
    return { success: true, stats: JSON.parse(JSON.stringify(stats)) };
  } catch (error: any) {
    console.error("[Stats Engine] Recalculation failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Anomaly Detection Stub
 * Checks for unusual financial or operational patterns.
 */
export async function detectAnomalies(
  type: 'ORDER' | 'PAYMENT' | 'CREDIT',
  data: any,
  transaction?: admin.firestore.Transaction | null
) {
  // TODO: Implement actual anomaly detection logic
  // For now, just log the event
  console.log(`[Anomaly Engine] Monitoring ${type} event:`, data);
  
  // Example logic: Flag payments > 1,000,000 as anomalies
  if (type === 'PAYMENT' && data.amount > 1000000) {
    console.warn("[Anomaly Engine] High-value payment detected!");
  }

  return { isAnomaly: false };
}
