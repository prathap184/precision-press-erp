const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function cleanAllTestTransactionsCascade() {
  console.log('🧹 Cascading deletion of all test transaction tables...');

  // 1. inventory_layer_consumption
  const { error: e1 } = await supabase.from('inventory_layer_consumption').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('• inventory_layer_consumption:', e1 ? e1.message : 'Cleaned');

  // 2. inventory_cost_layer
  const { error: e2 } = await supabase.from('inventory_cost_layer').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('• inventory_cost_layer:', e2 ? e2.message : 'Cleaned');

  // 3. inventory_movement
  const { error: e3 } = await supabase.from('inventory_movement').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('• inventory_movement:', e3 ? e3.message : 'Cleaned');

  // 4. customer_credit
  const { error: e4 } = await supabase.from('customer_credit').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('• customer_credit:', e4 ? e4.message : 'Cleaned');

  // 5. payment_allocation & payment
  await supabase.from('payment_allocation').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: e5 } = await supabase.from('payment').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('• payment:', e5 ? e5.message : 'Cleaned');

  // 6. journal_line
  const { error: e6 } = await supabase.from('journal_line').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('• journal_line:', e6 ? e6.message : 'Cleaned');

  // 7. journal_entry
  const { error: e7 } = await supabase.from('journal_entry').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('• journal_entry:', e7 ? e7.message : 'Cleaned');

  // Verify count
  const { data: remaining } = await supabase.from('journal_entry').select('id');
  console.log(`\n🎉 FINAL VERIFICATION: Remaining journal_entry count = ${remaining ? remaining.length : 0}`);
}

cleanAllTestTransactionsCascade();
