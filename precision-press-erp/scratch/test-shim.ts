import { db } from '../src/lib/firebase';
import { collection, getDocs } from '../src/lib/supabase-firestore-shim';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  const ref = collection(db, 'orders', 'ORD-836633', 'items');
  const snap = await getDocs(ref);
  console.log('Shim items count:', snap.docs.length);
  snap.docs.forEach(doc => {
    console.log('Shim doc:', doc.id, doc.data());
  });
}

test().then(() => process.exit(0)).catch(console.error);
