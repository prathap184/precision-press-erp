const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const snapshot = await db.collection('products').where('status', '==', 'ACTIVE').limit(10).get();
  console.log(`Found ${snapshot.size} active products.`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Product: ${data.name} (ID: ${doc.id})`);
    console.log(`  baseRate: ${data.baseRate}`);
    console.log(`  eyeletPricing:`, data.eyeletPricing);
    console.log(`  deliveryPricing:`, data.deliveryPricing);
  });
}

run().catch(console.error);
