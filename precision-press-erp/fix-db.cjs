const admin = require('firebase-admin');
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
admin.initializeApp({ projectId: 'demo-project' });
const db = admin.firestore();

async function fix() {
  // 1. Fix profiles
  const profiles = await db.collection('profiles').where('role', '==', 'PRINTER').get();
  for (const doc of profiles.docs) {
    const data = doc.data();
    if (data.printerCategory === 'ECOSOLVENT' || data.printerCategory === 'eco_solvent' || data.printerCategory === 'ECO SOLVENT') {
      console.log('Fixing profile printerCategory for', doc.id);
      await doc.ref.update({ printerCategory: 'ECO_SOLVENT' });
    }
  }

  // 2. Fix orders
  const orders = await db.collection('orders').get();
  for (const doc of orders.docs) {
    const data = doc.data();
    let needsUpdate = false;
    let newCat = data.printerCategory;
    
    // If order has no printerCategory, try to infer it from items
    if (!newCat) {
       if (data.items && data.items.length > 0) {
          const first = data.items[0];
          const name = first.productName || first.name || '';
          if (name.toLowerCase().includes('eco')) newCat = 'ECO_SOLVENT';
          else if (name.toLowerCase().includes('uv')) newCat = 'UV_PRINT';
          else if (name.toLowerCase().includes('vinyl')) newCat = 'VINYL_PRINT';
          else newCat = 'SOLVENT_PRINT';
       }
    }

    if (newCat === 'ECOSOLVENT' || newCat === 'eco_solvent' || newCat === 'ECO SOLVENT') {
      newCat = 'ECO_SOLVENT';
    }

    if (newCat !== data.printerCategory) {
      console.log('Fixing order printerCategory for', doc.id, 'to', newCat);
      await doc.ref.update({ printerCategory: newCat });
    }
  }
  console.log('Done!');
  process.exit(0);
}
fix();
