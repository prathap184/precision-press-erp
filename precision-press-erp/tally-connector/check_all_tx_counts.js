const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkAllCounts() {
  const tables = [
    'journal_entry',
    'journal_line',
    'invoice',
    'invoice_line',
    'payment',
    'payment_allocation',
    'customer_credit',
    'credit_note',
    'credit_note_line',
    'bill',
    'bill_line',
    'tally_sync_queue',
    'audit_log',
    'activity_log'
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('id', { count: 'exact' });
    console.log(`${t.padEnd(22)}: ${error ? error.message : (data ? data.length : 0)}`);
  }
}

checkAllCounts();
