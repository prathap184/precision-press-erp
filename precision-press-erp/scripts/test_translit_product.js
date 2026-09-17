const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function parseProduct(row) {
  const meta = row.metadata || {};
  const uom = (row.unit_of_measure || row.tally_uom || 'N').trim();
  const defaultMode = (row.tally_billing_mode === 'A' || meta.billingMode === 'A') ? 'A' : 'B';
  const isMultiSize = row.has_multiple_sizes !== null && row.has_multiple_sizes !== undefined 
    ? Boolean(row.has_multiple_sizes) 
    : (meta.hasMultipleSizes !== undefined ? Boolean(meta.hasMultipleSizes) : (meta.has_multiple_sizes !== undefined ? Boolean(meta.has_multiple_sizes) : false));

  return {
    name: row.name,
    sku: row.sku,
    has_multiple_sizes: isMultiSize,
    hasMultipleSizes: isMultiSize,
    tally_billing_mode: defaultMode,
    unit_of_measure: uom,
    metadata: row.metadata
  };
}

async function test() {
  const { data } = await supabase.from('inventory_item').select('*').ilike('name', '%Translit Max FX%');
  console.log(data.map(parseProduct));
}

test().catch(console.error);
