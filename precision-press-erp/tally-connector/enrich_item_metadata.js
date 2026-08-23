const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function enrichMetadata() {
  console.log('🔄 Enriching Direct vs Non-Direct metadata for all inventory items...');
  
  const { data: items, error } = await supabase
    .from('inventory_item')
    .select('id, name, unit_of_measure, tally_uom, sale_price, purchase_price, metadata');

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  console.log(`Found ${items.length} items to evaluate.`);
  let updatedCount = 0;

  for (const item of items) {
    const uom = (item.unit_of_measure || item.tally_uom || '').toLowerCase();
    const isAreaOrBulk = ['sqft', 'r', 'sh', 'kg', 'mt', 'ft', 'lt', 'ml'].includes(uom);
    const isDirect = !isAreaOrBulk; // 'n', 'no', 'pc', 'set', 'box', 'pkt'

    const currentMeta = item.metadata || {};
    const baseRate = item.sale_price ? (item.sale_price / 100) : 0;

    const newMeta = {
      ...currentMeta,
      isDirectSelling: isDirect,
      ...(isDirect ? {} : { baseRate: currentMeta.baseRate || baseRate })
    };

    const { error: updateError } = await supabase
      .from('inventory_item')
      .update({ metadata: newMeta })
      .eq('id', item.id);

    if (!updateError) {
      updatedCount++;
    }
  }

  console.log(`✅ Successfully updated ${updatedCount} items with precise Direct vs Non-Direct metadata!`);
}

enrichMetadata();
