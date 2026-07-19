import { adminDb as db } from './src/lib/firebase-admin';

async function main() {
  try {
    const productsSnap = await db.collection('products').limit(5).get();
    console.log('--- PRODUCTS COUNT:', productsSnap.size);
    productsSnap.docs.forEach(d => {
      console.log('Product ID:', d.id, 'Has workflowSteps:', !!d.data().workflowSteps);
    });

    const ordersSnap = await db.collection('orders').limit(5).get();
    console.log('--- ORDERS COUNT:', ordersSnap.size);
    ordersSnap.docs.forEach(d => {
      console.log('Order ID:', d.id, 'Status:', d.data().status, 'Has workflowSnapshot:', !!d.data().workflowSnapshot);
    });
  } catch (error) {
    console.error('Error running script:', error);
  }
}

main();
