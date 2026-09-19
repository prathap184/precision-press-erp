const fs = require('fs');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

async function inspect() {
  const xmlPath = 'C:\\Users\\jprat\\Videos\\groups.xml';
  console.log('📂 Inspecting XML file:', xmlPath);
  const content = fs.readFileSync(xmlPath, 'utf16le');

  // Parse STOCKGROUP blocks
  const stockGroupRegex = /<STOCKGROUP NAME="([^"]*)"[^>]*>([\s\S]*?)<\/STOCKGROUP>/gi;
  let sgMatch;
  const stockGroups = [];

  while ((sgMatch = stockGroupRegex.exec(content)) !== null) {
    const name = sgMatch[1];
    const body = sgMatch[2];
    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const parentM = body.match(/<PARENT>([^<]*)<\/PARENT>/i);
    const alterM = body.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
    const hsnM = body.match(/<HSNCODE>([^<]*)<\/HSNCODE>/i) || body.match(/<HSNDESCRIPTION>([^<]*)<\/HSNDESCRIPTION>/i);
    const taxM = body.match(/<GSTRATEDETAILS.LIST>([\s\S]*?)<\/GSTRATEDETAILS.LIST>/i);
    const igstM = body.match(/<GSTRATE>([^<]*)<\/GSTRATE>/i);
    const isAddableM = body.match(/<ISADDABLE>([^<]*)<\/ISADDABLE>/i);

    stockGroups.push({
      name,
      parent: parentM ? parentM[1].trim() : '',
      guid: guidM ? guidM[1].trim() : null,
      alterId: alterM ? alterM[1].trim() : null,
      hsn: hsnM ? hsnM[1].trim() : null,
      isAddable: isAddableM ? isAddableM[1].trim() : null
    });
  }

  // Parse UNIT blocks
  const unitRegex = /<UNIT NAME="([^"]*)"[^>]*>([\s\S]*?)<\/UNIT>/gi;
  let uMatch;
  const units = [];
  while ((uMatch = unitRegex.exec(content)) !== null) {
    const name = uMatch[1];
    const body = uMatch[2];
    const guidM = body.match(/<GUID>([^<]*)<\/GUID>/i);
    const origM = body.match(/<ORIGINALNAME>([^<]*)<\/ORIGINALNAME>/i);
    const decimalM = body.match(/<DECIMALPLACES>([^<]*)<\/DECIMALPLACES>/i);
    units.push({
      name,
      originalName: origM ? origM[1].trim() : null,
      decimalPlaces: decimalM ? parseInt(decimalM[1].trim(), 10) : 0,
      guid: guidM ? guidM[1].trim() : null
    });
  }

  // Parse STOCKCATEGORY blocks
  const catRegex = /<STOCKCATEGORY NAME="([^"]*)"[^>]*>([\s\S]*?)<\/STOCKCATEGORY>/gi;
  let catMatch;
  const categories = [];
  while ((catMatch = catRegex.exec(content)) !== null) {
    categories.push(catMatch[1]);
  }

  console.log(`\n📊 XML ENTITY SUMMARY:`);
  console.log(`• Stock Groups (<STOCKGROUP>): ${stockGroups.length}`);
  console.log(`• Units of Measure (<UNIT>): ${units.length}`);
  console.log(`• Stock Categories (<STOCKCATEGORY>): ${categories.length}`);

  console.log('\n--- ALL STOCK GROUPS IN groups.xml ---');
  stockGroups.forEach((g, i) => {
    console.log(`${i + 1}. "${g.name}" | Parent: "${g.parent || '(Primary)'}" | GUID: ${g.guid} | AlterID: ${g.alterId}`);
  });

  console.log('\n--- ALL UNITS IN groups.xml ---');
  units.forEach((u, i) => {
    console.log(`${i + 1}. Symbol: "${u.name}" | Formal Name: "${u.originalName}" | Decimals: ${u.decimalPlaces} | GUID: ${u.guid}`);
  });

  // Query Database Schema to find where Item Groups and Units are stored in ERP
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('            🔍 ERP DATABASE SCHEMA INSPECTION');
  console.log('═══════════════════════════════════════════════════════════════════════');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // List all tables
  const allTablesRes = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('\nAll tables in public schema:\n', allTablesRes.rows.map(r => r.table_name).join(', '));

  // Check product / item / category / group / unit tables
  const targetTables = ['category', 'categories', 'product_category', 'item_group', 'item_groups', 'stock_group', 'stock_groups', 'products', 'items', 'item', 'unit', 'units', 'unit_of_measure'];
  for (const t of targetTables) {
    const check = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      )
    `, [t]);
    if (check.rows[0].exists) {
      const cnt = await pool.query(`SELECT count(*) FROM public."${t}"`);
      const cols = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
      `, [t]);
      console.log(`\nFound Table: [public.${t}] (rows: ${cnt.rows[0].count})`);
      console.log('Columns:', cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));
    }
  }

  await pool.end();
}

inspect().catch(console.error);
