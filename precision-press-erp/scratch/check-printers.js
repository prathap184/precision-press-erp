require('dotenv').config({ path: '.env.local' });
const { adminDb } = require('../src/lib/firebase-admin');

async function run() {
  const snap = await adminDb.collection('profiles').where('role', '==', 'PRINTER').get();
  console.log('Printer profiles count:', snap.size);
  snap.forEach(doc => {
    console.log('Printer:', doc.id, JSON.stringify(doc.data(), null, 2));
  });
}

run().then(() => process.exit(0)).catch(console.error);
