const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fastEnrich() {
  console.log('🔄 Fast enriching metadata for all 582 items...');
  const { data: items, error } = await supabase
    .from('inventory_item')
    .select('*');

  if (error) {
    console.error('Fetch error:', error);
    return;
  }

  const updatedItems = items.map(item => {
    const uom = (item.unit_of_measure || item.tally_uom || '').toLowerCase();
    const isAreaOrBulk = ['sqft', 'r', 'sh', 'kg', 'mt', 'ft', 'lt', 'ml'].includes(uom);
    const isDirect = !isAreaOrBulk;

    const currentMeta = (typeof item.metadata === 'object' && item.metadata !== null) ? item.metadata : {};
    const baseRate = item.sale_price ? (item.sale_price / 100) : 0;

    return {
      ...item,
      metadata: {
        ...currentMeta,
        isDirectSelling: isDirect,
        ...(isDirect ? {} : { baseRate: currentMeta.baseRate || baseRate })
      }
    };
  });

  const chunkSize = 50;
  let successCount = 0;
  for (let i = 0; i < updatedItems.length; i += chunkSize) {
    const chunk = updatedItems.slice(i, i + chunkSize);
    const { error: upsertErr } = await supabase
      .from('inventory_item')
      .upsert(chunk, { onConflict: 'organization_id,code' });
    if (upsertErr) {
      console.error(`Chunk error at ${i}:`, upsertErr.message);
    } else {
      successCount += chunk.length;
    }
  }

  console.log(`✅ Completed! ${successCount} / ${items.length} items updated in database.`);
}

fastEnrich();
