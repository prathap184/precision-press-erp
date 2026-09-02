// scripts/compare_sample_entities.js
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function checkSampleData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('          🔎 REAL DATA SAMPLE VERIFICATION FROM ERP DATABASE        ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // 1. Customer Sample
  const { data: customer } = await supabase
    .from('contact')
    .select('id, name, type, gstin, tax_number, pan_number, phone, email, place_of_supply, billing_address_line1, billing_city, billing_state, billing_pincode, opening_balance, opening_balance_type, tally_guid, tally_ledger_name')
    .eq('type', 'customer')
    .not('tally_guid', 'is', null)
    .limit(1)
    .single();

  console.log('1️⃣ CUSTOMER TABLE SAMPLE (`public.contact`):');
  console.log(JSON.stringify(customer, null, 2));

  // 2. Supplier Sample
  const { data: supplier } = await supabase
    .from('contact')
    .select('id, name, type, gstin, tax_number, pan_number, phone, email, place_of_supply, billing_address_line1, billing_city, billing_state, opening_balance, opening_balance_type, tally_guid, tally_ledger_name')
    .eq('type', 'supplier')
    .limit(1)
    .single();

  console.log('\n2️⃣ SUPPLIER TABLE SAMPLE (`public.contact`):');
  console.log(JSON.stringify(supplier, null, 2));

  // 3. Stock Item Sample
  const { data: item } = await supabase
    .from('inventory_item')
    .select('id, code, name, tally_item_name, tally_guid, tally_stock_group, category, unit_of_measure, hsn_code, gst_rate, purchase_price, sale_price, quantity_on_hand, opening_quantity, opening_rate, opening_value')
    .not('tally_guid', 'is', null)
    .limit(1)
    .single();

  console.log('\n3️⃣ STOCK ITEM TABLE SAMPLE (`public.inventory_item`):');
  console.log(JSON.stringify(item, null, 2));

  // 4. Bank Account Sample
  const { data: bank } = await supabase
    .from('bank_account')
    .select('id, account_name, account_number, bank_name, currency_code, account_type, balance, chart_account_id, tally_ledger_name, tally_guid, chart_account(id, code, name, opening_balance, opening_balance_type)')
    .limit(1)
    .single();

  console.log('\n4️⃣ BANK ACCOUNT TABLE SAMPLE (`public.bank_account`):');
  console.log(JSON.stringify(bank, null, 2));
}

checkSampleData().catch(console.error);
