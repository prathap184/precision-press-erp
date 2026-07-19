
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

async function checkProducts() {
  console.log('Fetching products...');
  const snap = await db.collection('products').get();
  
  const results = [];
  snap.forEach(doc => {
    const data = doc.data();
    results.push({
      id: doc.id,
      name: data.name,
      category: data.category,
      workflowSteps: data.workflowSteps || [],
      hasWorkflow: !!(data.workflowSteps && data.workflowSteps.length > 0)
    });
  });

  console.table(results.map(r => ({
    Name: r.name,
    Category: r.category,
    Steps: r.workflowSteps.length,
    HasWorkflow: r.hasWorkflow
  })));

  const missing = results.filter(r => !r.hasWorkflow);
  if (missing.length > 0) {
    console.log('\nProducts missing workflow steps:');
    missing.forEach(p => console.log(`- ${p.name} (${p.category})`));
  }
}

checkProducts().then(() => process.exit(0));
