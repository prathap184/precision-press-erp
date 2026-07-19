import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { supabase } from '../src/lib/supabase';
import { collection, getDocs, query, where } from '../src/lib/supabase-firestore-shim';

async function testCompat() {
  console.log('Testing compat layer queries...');
  try {
    const q = query(collection(null as any, 'orders'), where('status', 'not-in', ['COMPLETED', 'DISPATCHED', 'CANCELLED']));
    const snap = await getDocs(q);
    console.log('Query returned count:', snap.size);
    if (snap.size > 0) {
      console.log('First order status:', snap.docs[0].data().status);
      console.log('Unique statuses in result:', Array.from(new Set(snap.docs.map(d => d.data().status))));
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testCompat().then(() => process.exit(0)).catch(console.error);
