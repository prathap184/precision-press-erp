require('dotenv').config({ path: '.env.local' });

async function check() {
  const { adminDb } = await import('../src/lib/firebase-admin');
  const orderId = 'ORD-400284';
  const orderRef = adminDb.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  console.log('Order exists:', snap.exists);
  if (snap.exists) {
    const data = snap.data();
    console.log('Order Data:', JSON.stringify(data, null, 2));
  }
  
  const itemsSnap = await orderRef.collection('items').get();
  console.log('Subcollection items count:', itemsSnap.docs ? itemsSnap.docs.length : 0);
  if (itemsSnap.docs) {
    itemsSnap.docs.forEach((doc: any) => {
      console.log('Item Data:', doc.id, JSON.stringify(doc.data(), null, 2));
    });
  }
}

check().then(() => process.exit(0)).catch(console.error);
