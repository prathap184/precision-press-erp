const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

async function run() {
  console.log('-----------------------------------------------------------------------');
  console.log('         ?? INVESTIGATION: WHERE IS "B1" VS "Main Location"?           ');
  console.log('-----------------------------------------------------------------------\n');

  // 1. Check items.xml
  const xml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
  const godownTags = [...xml.matchAll(/<GODOWNNAME>([^<]*)<\/GODOWNNAME>/gi)];
  console.log(`1. Total <GODOWNNAME> tags found in items.xml: ${godownTags.length}`);
  const godownNameCounts = {};
  godownTags.forEach(m => {
    const val = m[1].trim();
    godownNameCounts[val] = (godownNameCounts[val] || 0) + 1;
  });
  console.log('   Godowns inside items.xml:', godownNameCounts);

  const b1InXml = xml.match(/\bB1\b/g);
  console.log(`   Does "B1" appear anywhere in items.xml? ${b1InXml ? `YES (${b1InXml.length} times)` : 'NO (Zero occurrences)'}`);

  // 2. Check Database: public.inventory_item
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('\n2. Checking public.inventory_item in database:');
  const b1Items = await client.query(`
    SELECT id, code, name, category, metadata
    FROM public.inventory_item
    WHERE code LIKE '%B1%' 
       OR name LIKE '%B1%' 
       OR description LIKE '%B1%' 
       OR metadata::text LIKE '%B1%';
  `);
  console.log(`   Items containing 'B1' in code/name/metadata: ${b1Items.rows.length}`);
  if (b1Items.rows.length > 0) {
    console.table(b1Items.rows.slice(0, 5));
  }

  // 3. Check public.warehouse_stock
  console.log('\n3. Checking public.warehouse_stock in database:');
  const wsRes = await client.query(`SELECT count(*) FROM public.warehouse_stock;`);
  console.log(`   Total rows in public.warehouse_stock: ${wsRes.rows[0].count}`);

  // 4. Check public.warehouse
  console.log('\n4. Checking public.warehouse table:');
  const whRes = await client.query(`SELECT id, name, code, is_default, is_active FROM public.warehouse;`);
  console.table(whRes.rows);

  await client.end();
}

run().catch(console.error);
