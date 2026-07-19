import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('invoices').select('id').limit(1);
  if (error) {
    console.error('Invoices Error:', error.message);
  } else {
    console.log('Invoices OK');
  }

  const { data: dData, error: dError } = await supabase.from('dispatch_receipts').select('id').limit(1);
  if (dError) {
    console.error('Dispatch Receipts Error:', dError.message);
  } else {
    console.log('Dispatch Receipts OK');
  }

  const { data: sData, error: sError } = await supabase.from('sales_receipts').select('id').limit(1);
  if (sError) {
    console.error('Sales Receipts Error:', sError.message);
  } else {
    console.log('Sales Receipts OK');
  }
}

check();
