const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STANDARD_WORKFLOW = [
  { id: "step-1", label: "Accounts Approval", role: "ACCOUNTANT", blocking: true },
  { id: "step-2", label: "Design & Artwork", role: "DESIGNER", blocking: true },
  { id: "step-3", label: "Manager Sign-Off", role: "MANAGER", blocking: true },
  { id: "step-4", label: "Printing", role: "PRINTER", blocking: true },
  { id: "step-5", label: "Pasting", role: "PASTING", blocking: true },
  { id: "step-6", label: "Finishing", role: "FINISHING", blocking: true },
  { id: "step-7", label: "Dispatch", role: "DISPATCH", blocking: true },
  { id: "step-8", label: "Delivery", role: "DELIVERY", blocking: true }
];

async function backfillCategorySkuWorkflow() {
  console.log('🔄 Backfilling Category, SKU, and Default Workflow for all items...');

  // 1. Fetch categories
  const { data: categories } = await supabase
    .from('inventory_category')
    .select('id, name');

  const catMap = new Map();
  (categories || []).forEach(c => catMap.set(c.name.toLowerCase().trim(), c.id));

  // 2. Fetch items
  const { data: items, error } = await supabase
    .from('inventory_item')
    .select('*');

  if (error) {
    console.error('Fetch error:', error);
    return;
  }

  console.log(`Found ${items.length} items to update.`);

  const updatedItems = items.map(item => {
    // Determine category_id
    let categoryId = item.category_id;
    const catName = (item.category || item.tally_stock_group || '').toLowerCase().trim();
    if (catName && catMap.has(catName)) {
      categoryId = catMap.get(catName);
    }

    // Determine SKU
    let sku = item.sku;
    if (!sku || sku.trim() === '') {
      sku = item.code || `SKU-${item.id.slice(0, 8).toUpperCase()}`;
    }

    // Determine workflow steps
    let steps = item.workflow_steps;
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      steps = STANDARD_WORKFLOW;
    }

    return {
      ...item,
      category_id: categoryId,
      sku: sku,
      workflow_steps: steps
    };
  });

  // Batch update
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

  console.log(`✅ SUCCESS! Updated ${successCount} / ${items.length} items with Category, SKU, and Default Workflow!`);
}

backfillCategorySkuWorkflow();
