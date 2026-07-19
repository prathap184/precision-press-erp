import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectOrders() {
  const { data: cols, error } = await supabase
    .from('orders')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching order columns:', error.message);
  } else if (cols && cols.length > 0) {
    console.log('Columns in orders table:', Object.keys(cols[0]));
    console.log('Sample order data:', cols[0]);
  } else {
    console.log('No orders in database to inspect.');
  }
}

inspectOrders().catch(console.error);
