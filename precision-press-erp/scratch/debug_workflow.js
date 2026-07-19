
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Manually fix the private key if needed (it often contains literal \n characters)
if (process.env.FIREBASE_PRIVATE_KEY) {
  process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
}

console.log('Project ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log('Client Email:', process.env.FIREBASE_CLIENT_EMAIL);

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

async function debug() {
  console.log('--- PRODUCTS WORKFLOW STEPS ---');
  const productsSnap = await db.collection('products').get();
  productsSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Product: ${data.name} (${doc.id})`);
    console.log(`- Workflow Steps:`, JSON.stringify(data.workflowSteps || [], null, 2));
  });

  console.log('\n--- RECENT ORDERS WORKFLOW STATE ---');
  const ordersSnap = await db.collection('orders').orderBy('createdAt', 'desc').limit(10).get();
  ordersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Order: ${doc.id}`);
    console.log(`- Status: ${data.status}`);
    console.log(`- Current Workflow Role: ${data.currentWorkflowRole}`);
    console.log(`- Current Workflow Label: ${data.currentWorkflowLabel}`);
    console.log(`- Workflow Snapshot Index: ${data.workflowSnapshot?.currentStepIndex}`);
    if (data.workflowSnapshot?.steps) {
      console.log(`- Steps Statuses:`, data.workflowSnapshot.steps.map(s => `${s.label}: ${s.status} (${s.role})`).join(' -> '));
    }
  });
}

debug().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
