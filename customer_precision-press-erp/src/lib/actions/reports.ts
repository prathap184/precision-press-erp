// @ts-nocheck
'use server';
import { adminDb } from '../firebase-admin';

export async function getManagerStats() {
  try {
    const transactionsSnap = await adminDb.collection('transactions').get();
    let totalSales = 0;
    let totalReceipts = 0;

    transactionsSnap.forEach(doc => {
      const data = doc.data();
      totalSales += data.debit || 0;
      totalReceipts += data.credit || 0;
    });

    const usersSnap = await adminDb.collection('profiles').where('role', '==', 'CUSTOMER').get();
    let creditExposure = 0;
    usersSnap.forEach(doc => {
      creditExposure += doc.data().usedCredit || 0;
    });

    const ordersSnap = await adminDb.collection('orders').get();
    const totalOrders = ordersSnap.size;

    // Last 30 days logic (optional but useful)
    const recentOrdersSnap = await adminDb.collection('orders')
      .where('createdAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .get();

    return {
      totalSales,
      totalReceipts,
      pendingPayments: totalSales - totalReceipts,
      creditExposure,
      totalOrders,
      recentOrders: recentOrdersSnap.size
    };
  } catch (error) {
    console.error('Error fetching manager stats:', error);
    return null;
  }
}

export async function getPrinterQueue() {
  try {
    const ordersSnap = await adminDb.collection('orders')
      .where('status', 'in', ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'])
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const queue: any[] = [];
    for (const doc of ordersSnap.docs) {
      const orderData = doc.data();
      
      // OPTIMIZATION: Eliminate N+1 DB query by using the embedded items array
      // Instead of: const itemsSnap = await adminDb.collection(`orders/${doc.id}/items`).get();
      const items = orderData.items || [];
      
      queue.push({
        id: doc.id,
        ...orderData,
        items
      });
    }

    return JSON.parse(JSON.stringify(queue));
  } catch (error) {
    console.error('Error fetching printer queue:', error);
    return [];
  }
}

export async function getDispatchQueue() {
  try {
    const ordersSnap = await adminDb.collection('orders')
      .where('status', 'in', ['COMPLETED', 'DISPATCHED'])
      .orderBy('updatedAt', 'desc')
      .get();

    const data = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    console.error('Error fetching dispatch queue:', error);
    return [];
  }
}

