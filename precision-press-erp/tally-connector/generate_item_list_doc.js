const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function exportFullItemList() {
  const { data: items, error } = await supabase
    .from('inventory_item')
    .select('code, name, category, unit_of_measure, tally_uom, opening_quantity, purchase_price, sale_price, metadata')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const directItems = [];
  const nonDirectItems = [];

  items.forEach(it => {
    const isDirect = it.metadata?.isDirectSelling === true;
    if (isDirect) {
      directItems.push(it);
    } else {
      nonDirectItems.push(it);
    }
  });

  let md = '# 📦 Complete Catalog of 582 Stock Items: Direct vs Non-Direct Selling\n\n';
  md += `**Total Items:** ${items.length} | 🏷️ **Direct Selling Items:** ${directItems.length} | 📐 **Non-Direct (Fabrication / Raw) Items:** ${nonDirectItems.length}\n\n`;
  md += '---\n\n';

  md += '## 🏷️ SECTION 1: DIRECT SELLING ITEMS (395 Items)\n';
  md += '*Products sold unit-by-unit / piece-by-piece (Spray cans, Cutters, Tapes, Accessories, Tools, Hardware).*\n\n';
  md += '| Item Code | Product Name | Category / Group | Tally UOM | Opening Stock | Cost (₹) | Selling Price (₹) |\n';
  md += '| :--- | :--- | :--- | :---: | :---: | :---: | :---: |\n';

  directItems.forEach(it => {
    const cost = (it.purchase_price / 100).toFixed(2);
    const price = (it.sale_price / 100).toFixed(2);
    const uom = it.tally_uom || it.unit_of_measure || 'N';
    md += `| \`${it.code}\` | **${it.name}** | ${it.category || 'General'} | \`${uom}\` | ${it.opening_quantity} | ₹${cost} | ₹${price} |\n`;
  });

  md += '\n---\n\n';
  md += '## 📐 SECTION 2: NON-DIRECT SELLING / RAW FABRICATION ITEMS (187 Items)\n';
  md += '*Raw materials sold by dimensions (Sq.Ft), sheets, rolls, kilograms, or liters.*\n\n';
  md += '| Item Code | Product Name | Category / Group | Tally UOM | Opening Stock | Cost (₹) | Base Rate (₹) |\n';
  md += '| :--- | :--- | :--- | :---: | :---: | :---: | :---: |\n';

  nonDirectItems.forEach(it => {
    const cost = (it.purchase_price / 100).toFixed(2);
    const baseRate = it.metadata?.baseRate ? Number(it.metadata.baseRate).toFixed(2) : (it.sale_price / 100).toFixed(2);
    const uom = it.tally_uom || it.unit_of_measure || 'sqft';
    md += `| \`${it.code}\` | **${it.name}** | ${it.category || 'General'} | \`${uom}\` | ${it.opening_quantity} | ₹${cost} | ₹${baseRate} |\n`;
  });

  const outPath = path.resolve(__dirname, '../ALL_582_ITEMS_DIRECT_VS_NONDIRECT.md');
  fs.writeFileSync(outPath, md, 'utf8');
  console.log(`✅ Saved full markdown list to ${outPath}`);
}

exportFullItemList();
