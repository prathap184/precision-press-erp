require('dotenv').config({ path: '.env.local' });
const { adminDb } = require('../src/lib/firebase-admin');

async function main() {
  try {
    const orderId = 'ORD-775167';
    console.log(`Checking order: ${orderId}`);
    const orderSnap = await adminDb.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
      console.log('Order NOT found!');
    } else {
      console.log('Order Data:', JSON.stringify(orderSnap.data(), null, 2));
    }

    console.log(`\nChecking payments for order: ${orderId}`);
    const paymentsSnap = await adminDb.collection('payments').where('orderId', '==', orderId).get();
    console.log(`Found ${paymentsSnap.size} payments.`);
    paymentsSnap.forEach((doc: any) => {
      console.log(`Payment ID: ${doc.id}`);
      console.log('Payment Data:', JSON.stringify(doc.data(), null, 2));
    });
  } catch (err) {
    console.error('Error during inspection:', err);
  }
}

main();
