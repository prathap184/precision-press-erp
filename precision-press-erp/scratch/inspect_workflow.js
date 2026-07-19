
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

if (process.env.FIREBASE_PRIVATE_KEY) {
  process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    }),
  });
}

const db = admin.firestore();

async function inspectWorkflow() {
  const snap = await db.collection('products').where('name', '==', 'Sol Vinyl Standard').limit(1).get();
  if (snap.empty) {
    console.log('Product not found');
    return;
  }
  const product = snap.docs[0].data();
  console.log(`Workflow for ${product.name}:`);
  console.log(JSON.stringify(product.workflowSteps, null, 2));
}

inspectWorkflow().then(() => process.exit(0));
