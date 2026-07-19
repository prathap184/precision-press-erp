const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
if (privateKey.startsWith('"') && privateKey.endsWith('",')) {
    privateKey = privateKey.substring(1, privateKey.length - 2);
} else if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
}
privateKey = privateKey.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  }),
});

const db = admin.firestore();

async function main() {
  const ordersSnap = await db.collection('orders').limit(10).get();
  console.log(`Inspecting ${ordersSnap.size} orders:`);
  ordersSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    console.log(`Order ID: ${docSnap.id}`);
    console.log(`  Status: ${data.status}`);
    console.log(`  currentWorkflowRole: ${data.currentWorkflowRole}`);
    console.log(`  currentWorkflowLabel: ${data.currentWorkflowLabel}`);
    console.log(`  Has workflowSnapshot: ${!!data.workflowSnapshot}`);
    if (data.workflowSnapshot) {
      console.log(`    currentStepIndex: ${data.workflowSnapshot.currentStepIndex}`);
      console.log(`    steps count: ${data.workflowSnapshot.steps?.length}`);
      if (data.workflowSnapshot.steps) {
        data.workflowSnapshot.steps.forEach((s, i) => {
          console.log(`      Step ${i}: ${s.label} (${s.role}) - ${s.status}`);
        });
      }
    }
    console.log('-----------------------------');
  });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
