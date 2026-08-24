const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ITEMS_XML_PATH = path.resolve(__dirname, '../tally_sync/all ledgers/stockitems.xml');

async function inspectChip() {
  const { data } = await supabase
    .from('inventory_item')
    .select('*')
    .ilike('name', '%94059900%');

  console.log('DB Record for CHIP- 94059900:', data);

  const xml = fs.readFileSync(ITEMS_XML_PATH, 'utf8');
  const regex = /<STOCKITEM NAME="[^"]*94059900[^"]*"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const body = m[0];
    console.log('\n=== TALLY XML FOR CHIP 94059900 ===');
    const balM = body.match(/<OPENINGBALANCE>([^<]*)<\/OPENINGBALANCE>/i);
    const rateM = body.match(/<OPENINGRATE>([^<]*)<\/OPENINGRATE>/i);
    const valM = body.match(/<OPENINGVALUE>([^<]*)<\/OPENINGVALUE>/i);
    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const unitsM = body.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);
    console.log({
      parent: parentM ? parentM[1] : null,
      units: unitsM ? unitsM[1] : null,
      openingBal: balM ? balM[1] : null,
      openingRate: rateM ? rateM[1] : null,
      openingVal: valM ? valM[1] : null
    });
  }
}

inspectChip();
