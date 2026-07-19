
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

async function testQueries() {
  const queries = [
    { name: 'Designer (==)', role: 'DESIGNER' },
    { name: 'Admin (IN)', role: ['ADMIN', 'MANAGER'] }
  ];

  for (const queryConfig of queries) {
    console.log(`\nTesting ${queryConfig.name} query...`);
    try {
      let q = db.collection('orders');
      if (Array.isArray(queryConfig.role)) {
        q = q.where('currentWorkflowRole', 'in', queryConfig.role);
      } else {
        q = q.where('currentWorkflowRole', '==', queryConfig.role);
      }
      q = q.orderBy('updatedAt', 'desc').limit(50);
      
      const snap = await q.get();
      console.log(`Query successful! Found ${snap.size} orders.`);
    } catch (err) {
      console.error(`Query failed: ${err.message}`);
    }
  }
}

testQueries().then(() => process.exit(0));
