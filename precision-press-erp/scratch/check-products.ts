import { adminDb } from '../src/lib/firebase-admin';

async function checkProducts() {
  const categories = ['SOLVENT_PRINT', 'ECO_SOLVENT', 'UV_ROLL', 'UV_FLAT_PRINT', 'DIGITAL_PRINT'];
  
  for (const cat of categories) {
    const snap = await adminDb.collection('products').where('category', '==', cat).get();
    console.log(`Category ${cat}: ${snap.size} products`);
  }
}

checkProducts().catch(console.error);
