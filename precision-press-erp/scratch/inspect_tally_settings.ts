require('dotenv').config({ path: '.env.local' });
const { adminDb } = require('../src/lib/firebase-admin');

async function main() {
  try {
    const docRef = adminDb.collection('settings').doc('tally');
    const snap = await docRef.get();
    console.log('Exists:', snap.exists);
    console.log('Data:', snap.data());
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
