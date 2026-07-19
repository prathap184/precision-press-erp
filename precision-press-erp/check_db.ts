require('dotenv').config({ path: '.env.local' });
import { adminDb } from './src/lib/firebase-admin';

async function check() {
  const orderId = 'ORD-836633';
  const orderRef = adminDb.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  console.log('Order exists:', snap.exists);
  if (snap.exists) {
    const data = snap.data();
    console.log('Order Data:', JSON.stringify(data, null, 2));
  }
  
  const itemsSnap = await orderRef.collection('items').get();
  console.log('Subcollection items count:', itemsSnap.size);
  itemsSnap.forEach(doc => {
    console.log('Item Data:', doc.id, JSON.stringify(doc.data(), null, 2));
  });
}

check().then(() => process.exit(0)).catch(console.error);
