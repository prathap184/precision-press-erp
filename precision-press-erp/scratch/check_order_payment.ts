require('dotenv').config({ path: '.env.local' });
const { adminDb } = require('../src/lib/firebase-admin');

async function main() {
  try {
    const id = 'ORD-990294';
    console.log(`Checking payment with ID: ${id}`);
    const paySnap = await adminDb.collection('payments').doc(id).get();
    if (paySnap.exists) {
      console.log("Found payment document:", paySnap.data());
    } else {
      console.log("No payment document found with ID:", id);
    }

    console.log("\nChecking payments for orderId: 'ORD-990294'");
    const qSnap = await adminDb.collection('payments').where('orderId', '==', id).get();
    console.log(`Found ${qSnap.size} payments:`);
    qSnap.forEach((doc: any) => {
      console.log(`Payment doc ID: ${doc.id}, data:`, doc.data());
    });

    console.log("\nChecking order details for 'ORD-990294'");
    const orderSnap = await adminDb.collection('orders').doc(id).get();
    if (orderSnap.exists) {
      console.log("Found order:", orderSnap.data());
    } else {
      console.log("No order found with ID:", id);
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

main();
