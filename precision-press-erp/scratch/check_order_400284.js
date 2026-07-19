const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkOrder() {
  const orderId = 'ORD-400284';
  console.log(`Checking order ${orderId}...`);
  const doc = await db.collection('orders').doc(orderId).get();
  if (doc.exists) {
    console.log('Order Data:', JSON.stringify(doc.data(), null, 2));
    const items = await db.collection('orders').doc(orderId).collection('items').get();
    console.log(`Found ${items.size} items in subcollection.`);
    items.forEach(item => {
      console.log('Item:', item.id, JSON.stringify(item.data(), null, 2));
    });
  } else {
    console.log('Order not found.');
  }
}

checkOrder().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
