const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Mock getCountFromServer & fetchRows from supabase-firestore-core.ts
async function fetchRows(client, table, constraints = []) {
  let builder = client.from(table).select('*');

  for (const constraint of constraints) {
    if (constraint.type !== 'where') continue;
    const fieldName = constraint.field;
    switch (constraint.op) {
      case '==':
        builder = builder.eq(fieldName, constraint.value);
        break;
      case 'in':
        builder = builder.in(fieldName, constraint.value);
        break;
      case 'not-in':
        builder = builder.not(fieldName, 'in', `(${constraint.value.map((item) => JSON.stringify(item)).join(',')})`);
        break;
      default:
        break;
    }
  }

  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

async function getCountFromServer(table, constraints = []) {
  const rows = await fetchRows(supabase, table, constraints);
  return {
    data: () => ({ count: rows.length }),
  };
}

async function runTest() {
  console.log('Running simulated fetchStats()...');
  try {
    const totalSnap = await getCountFromServer('orders');
    console.log('Total snap count:', totalSnap.data().count);

    const activeQ = [
      { type: 'where', field: 'status', op: 'not-in', value: ['COMPLETED', 'DISPATCHED', 'CANCELLED', 'DELIVERED'] }
    ];
    const activeSnap = await getCountFromServer('orders', activeQ);
    console.log('Active snap count:', activeSnap.data().count);

    const completedQ = [
      { type: 'where', field: 'status', op: 'in', value: ['COMPLETED', 'DISPATCHED', 'DELIVERED'] }
    ];
    const completedSnap = await getCountFromServer('orders', completedQ);
    console.log('Completed snap count:', completedSnap.data().count);

    console.log('All stats fetched successfully!');
  } catch (error) {
    console.error('Failed to fetch stats:', error);
  }
}

runTest().then(() => process.exit(0)).catch(console.error);
