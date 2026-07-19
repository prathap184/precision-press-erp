const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

admin.initializeApp({ projectId: 'demo-project' });
const db = admin.firestore();

async function run() {
  console.log('--- LATEST 5 ORDERS ---');
  const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(5).get();
  snap.forEach(doc => {
    console.log(doc.id, 'printerCategory:', doc.data().printerCategory, 'items:', doc.data().items?.map(i => i.productName).join(', '));
  });

  console.log('\n--- PRINTER PROFILES ---');
  const ps = await db.collection('profiles').where('role', '==', 'PRINTER').get();
  ps.forEach(doc => {
    console.log(doc.id, doc.data().email, 'printerCategory:', doc.data().printerCategory);
  });

  process.exit(0);
}
run();
