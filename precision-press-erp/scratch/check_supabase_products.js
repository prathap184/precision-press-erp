const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const { data, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Error fetching products:', error);
    return;
  }
  console.log(`Fetched ${data.length} products.`);
  data.slice(0, 10).forEach(p => {
    console.log(`Product: ${p.name} (ID: ${p.id})`);
    console.log(`  baseRate: ${p.baseRate}`);
    console.log(`  eyeletPricing:`, p.eyeletPricing);
    console.log(`  deliveryPricing:`, p.deliveryPricing);
  });
}

run().catch(console.error);
