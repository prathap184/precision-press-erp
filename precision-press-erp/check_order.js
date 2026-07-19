const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkOrder() {
  const orderId = 'ORD-836633';
  console.log(`Checking order ${orderId}...`);
  const doc = await db.collection('orders').doc(orderId).get();
  if (doc.exists) {
    console.log('Order exists:', doc.data());
    const items = await db.collection('orders').doc(orderId).collection('items').get();
    console.log(`Found ${items.size} items in subcollection.`);
    items.forEach(item => {
      console.log('Item:', item.id, item.data());
    });
  } else {
    console.log('Order not found with hyphen. Checking with space...');
    const doc2 = await db.collection('orders').doc('ORD 672646').get();
    if (doc2.exists) {
      console.log('Order exists with space:', doc2.data());
      const items = await db.collection('orders').doc('ORD 672646').collection('items').get();
      console.log(`Found ${items.size} items in subcollection.`);
      items.forEach(item => {
        console.log('Item:', item.id, item.data());
      });
    } else {
      console.log('Order completely not found.');
    }
  }
}

checkOrder();
