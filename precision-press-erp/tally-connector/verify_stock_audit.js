const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verifyStockData() {
  const { data: items, error } = await supabase
    .from('inventory_item')
    .select('id, name, code, category, tally_stock_group, unit_of_measure, hsn_code, gst_rate, quantity_on_hand, opening_value');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       📦 ERP LIVE INVENTORY AUDIT RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('✅ Total Inventory Items in Database:', items.length);

  const withHsn = items.filter(i => i.hsn_code && i.hsn_code.length > 0).length;
  const withStock = items.filter(i => i.quantity_on_hand > 0).length;
  const totalVal = items.reduce((s, i) => s + (Number(i.opening_value) || 0), 0);

  console.log('✅ Items with HSN / SAC Codes:     ', withHsn);
  console.log('✅ Items with Opening Stock:       ', withStock);
  console.log('✅ Total Opening Stock Valuation:   ₹' + totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));

  console.log('\n🔍 Sample 5 Live Products in Database:');
  items.slice(0, 5).forEach((item, idx) => {
    console.log(`\n[${idx + 1}] ${item.name} (${item.code})`);
    console.log(`    • Group: ${item.category} | UOM: ${item.unit_of_measure} | HSN: ${item.hsn_code} | GST: ${item.gst_rate}%`);
    console.log(`    • Stock Qty: ${item.quantity_on_hand} | Valuation: ₹${item.opening_value || 0}`);
  });
}
verifyStockData();
