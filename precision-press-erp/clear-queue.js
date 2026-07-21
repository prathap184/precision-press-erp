require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { adminDb } = require('./src/lib/firebase-admin');

async function clearQueue() {
  console.log('Clearing old tally sync queue...');
  const snap = await adminDb.collection('tally_sync_queue').get();
  
  if (!snap || snap.empty) {
    console.log('Queue is already empty.');
    process.exit(0);
  }

  const batch = adminDb.batch();
  snap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`Successfully deleted ${snap.size} old events from the queue.`);
  process.exit(0);
}

clearQueue().catch(console.error);
