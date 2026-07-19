
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

const STANDARD_STEPS = [
  { id: "step_acc", label: "Accountant", role: "ACCOUNTANT", blocking: true },
  { id: "step_des", label: "Designer", role: "DESIGNER", blocking: true },
  { id: "step_man", label: "Manager", role: "MANAGER", blocking: true },
  { id: "step_pri", label: "Printer", role: "PRINTER", blocking: true },
  { id: "step_dis", label: "Dispatch", role: "DISPATCH", blocking: true },
  { id: "step_del", label: "Delivery", role: "DELIVERY", blocking: true },
  { id: "step_fix", label: "Fixing", role: "FIXING", blocking: true }
];

async function migrate() {
  // 1. Fix Products
  console.log('Migrating products...');
  const productsSnap = await db.collection('products').get();
  const productBatch = db.batch();
  let productCount = 0;

  productsSnap.forEach(doc => {
    const data = doc.data();
    if (!data.workflowSteps || data.workflowSteps.length === 0) {
      productBatch.update(doc.ref, { 
        workflowSteps: STANDARD_STEPS,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      productCount++;
    }
  });

  if (productCount > 0) {
    await productBatch.commit();
    console.log(`Updated ${productCount} products with standard workflow.`);
  } else {
    console.log('No products needed update.');
  }

  // 2. Fix Orders
  console.log('\nMigrating orders...');
  const ordersSnap = await db.collection('orders').get();
  let orderCount = 0;
  
  for (const doc of ordersSnap.docs) {
    const data = doc.data();
    
    // Only fix orders missing workflow snapshots or roles
    if (!data.workflowSnapshot || !data.currentWorkflowRole) {
      console.log(`Fixing order ${doc.id} (Status: ${data.status})...`);
      
      const now = new Date();
      const snapshot = {
        steps: STANDARD_STEPS.map(step => ({
          ...step,
          status: 'LOCKED',
          history: []
        })),
        currentStepIndex: 0,
        version: 1
      };

      // Determine correct index based on status
      let index = 0;
      const status = data.status || 'PLACED';
      
      if (['ACCOUNTANT_APPROVED', 'DESIGNING'].includes(status)) {
        index = 1; // Designer
      } else if (['DESIGN_READY', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED'].includes(status)) {
        index = 2; // Manager
      } else if (['ASSIGNED', 'IN_PROGRESS'].includes(status)) {
        index = 3; // Printer
      } else if (status === 'COMPLETED') {
        index = 4; // Dispatch
      } else if (['DISPATCHED', 'IN_TRANSIT'].includes(status)) {
        index = 5; // Delivery
      } else if (status === 'DELIVERED') {
        index = 6; // Fixing
      }

      snapshot.currentStepIndex = index;
      
      // Update step statuses up to current index
      for (let i = 0; i < snapshot.steps.length; i++) {
        if (i < index) {
          snapshot.steps[i].status = 'COMPLETED';
          snapshot.steps[i].completedAt = now;
        } else if (i === index) {
          snapshot.steps[i].status = 'PENDING';
          snapshot.steps[i].startedAt = now;
        } else {
          snapshot.steps[i].status = 'LOCKED';
        }
      }

      const currentStep = snapshot.steps[index];
      
      await doc.ref.update({
        workflowSnapshot: snapshot,
        currentWorkflowRole: currentStep.role,
        currentWorkflowLabel: currentStep.label,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      orderCount++;
    }
  }

  console.log(`\nFixed ${orderCount} orders.`);
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
