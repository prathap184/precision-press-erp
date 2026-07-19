require('dotenv').config({ path: '.env.local' });
const { adminDb } = require('../src/lib/firebase-admin');

async function main() {
  try {
    console.log('Querying all PENDING payments...');
    const qSnap = await adminDb.collection('payments').where('status', '==', 'PENDING').get();
    console.log(`Found ${qSnap.size} pending payments:`);
    qSnap.forEach((doc: any) => {
      console.log(`Payment ID: ${doc.id}`);
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
    });
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
