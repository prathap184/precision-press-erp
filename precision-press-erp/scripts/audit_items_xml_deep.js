const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}

async function auditItems() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1. Get existing categories in database
  const catRes = await client.query('SELECT id, name, tally_guid FROM inventory_category');
  const dbCategories = new Map();
  catRes.rows.forEach(c => {
    dbCategories.set(c.name.toLowerCase().trim(), c);
  });
  console.log(`DB has ${dbCategories.size} inventory categories.`);

  // 2. Read and parse items.xml
  console.log('Reading items.xml...');
  const xml = readXml('C:\\Users\\jprat\\Videos\\items.xml');

  // Regex to extract all STOCKITEM blocks
  const itemRegex = /<STOCKITEM\b([\s\S]*?)<\/STOCKITEM>/gi;
  let match;
  const items = [];
  const nameSet = new Set();
  const guidSet = new Set();
  const duplicates = [];

  const parentGroupsCount = {};
  const unitsCount = {};
  let withOpeningBalance = 0;
  let withoutOpeningBalance = 0;
  let totalOpeningValue = 0;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    // Name
    const nameMatch = block.match(/NAME="([^"]+)"/i) || block.match(/<NAME[^>]*>([^<]+)<\/NAME>/i);
    const name = nameMatch ? nameMatch[1].trim() : null;

    // GUID
    const guidMatch = block.match(/<GUID[^>]*>([^<]+)<\/GUID>/i);
    const guid = guidMatch ? guidMatch[1].trim() : null;

    // Parent
    const parentMatch = block.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    let parent = parentMatch ? parentMatch[1].trim() : '';
    // Clean tally hidden character &#4;
    parent = parent.replace(/&#4;\s*/g, '').trim();

    // Base Units
    const unitMatch = block.match(/<BASEUNITS[^>]*>([^<]*)<\/BASEUNITS>/i);
    let baseUnit = unitMatch ? unitMatch[1].trim() : '';
    baseUnit = baseUnit.replace(/&#4;\s*/g, '').trim();

    // Additional Units
    const altUnitMatch = block.match(/<ADDITIONALUNITS[^>]*>([^<]*)<\/ADDITIONALUNITS>/i);
    let altUnit = altUnitMatch ? altUnitMatch[1].trim() : '';
    altUnit = altUnit.replace(/&#4;\s*/g, '').trim();
    if (altUnit === 'Not Applicable') altUnit = '';

    // Alter ID
    const alterMatch = block.match(/<ALTERID[^>]*>([^<]+)<\/ALTERID>/i);
    const alterId = alterMatch ? parseInt(alterMatch[1].trim(), 10) : null;

    // Opening Balance
    const obMatch = block.match(/<OPENINGBALANCE[^>]*>([^<]+)<\/OPENINGBALANCE>/i);
    const rawOb = obMatch ? obMatch[1].trim() : null;

    // Opening Value
    const ovMatch = block.match(/<OPENINGVALUE[^>]*>([^<]+)<\/OPENINGVALUE>/i);
    const rawOv = ovMatch ? parseFloat(ovMatch[1].trim()) : 0;

    // Opening Rate
    const orMatch = block.match(/<OPENINGRATE[^>]*>([^<]+)<\/OPENINGRATE>/i);
    const rawOr = orMatch ? orMatch[1].trim() : null;

    // Godown Name from Batch Allocations
    const godownMatch = block.match(/<GODOWNNAME[^>]*>([^<]+)<\/GODOWNNAME>/i);
    const godownName = godownMatch ? godownMatch[1].trim() : null;

    // Billing Type UDF
    const bTypeMatch = block.match(/<UDF:STKITEMSIZESBILLINGTYPE[^>]*>([^<]+)<\/UDF:STKITEMSIZESBILLINGTYPE>/i);
    const billingType = bTypeMatch ? bTypeMatch[1].trim() : null;

    // HSN Code
    const hsnMatch = block.match(/<HSNCODE[^>]*>([^<]+)<\/HSNCODE>/i) || block.match(/<HSN[^>]*>([^<]+)<\/HSN>/i);
    const hsnCode = hsnMatch ? hsnMatch[1].trim() : null;

    // GST Rate
    const gstMatch = block.match(/<GSTRATE[^>]*>([^<]+)<\/GSTRATE>/i) || block.match(/<RATE[^>]*>([^<]+)<\/RATE>/i);
    const gstRate = gstMatch ? parseFloat(gstMatch[1].trim()) : null;

    if (!guid) {
      console.warn('Item without GUID:', name);
      continue;
    }

    if (guidSet.has(guid)) {
      duplicates.push({ type: 'GUID', value: guid, name });
    }
    guidSet.add(guid);

    const itemObj = {
      name,
      guid,
      parent: parent || 'PRIMARY (None)',
      baseUnit: baseUnit || 'N/A',
      altUnit,
      alterId,
      rawOb,
      rawOv,
      rawOr,
      godownName,
      billingType,
      hsnCode,
      gstRate
    };

    items.push(itemObj);

    // Stats
    parentGroupsCount[itemObj.parent] = (parentGroupsCount[itemObj.parent] || 0) + 1;
    unitsCount[itemObj.baseUnit] = (unitsCount[itemObj.baseUnit] || 0) + 1;

    if (rawOb) {
      withOpeningBalance++;
      totalOpeningValue += rawOv;
    } else {
      withoutOpeningBalance++;
    }
  }

  console.log(`\n=======================================================`);
  console.log(`         ?? TALLY ITEMS.XML AUDIT REPORT               `);
  console.log(`=======================================================`);
  console.log(`• Total Stock Items Parsed      : ${items.length}`);
  console.log(`• Unique GUIDs                  : ${guidSet.size}`);
  console.log(`• Duplicate GUIDs               : ${duplicates.length}`);
  console.log(`• Items with Opening Balance    : ${withOpeningBalance}`);
  console.log(`• Items with 0 Opening Balance  : ${withoutOpeningBalance}`);
  console.log(`• Total Opening Stock Value     : ?${Math.abs(totalOpeningValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Tally raw sum: ${totalOpeningValue})`);

  console.log(`\n--- Stock Items by Parent Category in XML ---`);
  const sortedParents = Object.entries(parentGroupsCount).sort((a, b) => b[1] - a[1]);
  let mappedToDbCount = 0;
  let unmappedCount = 0;
  const unmappedGroups = new Set();

  for (const [p, count] of sortedParents) {
    const dbCat = dbCategories.get(p.toLowerCase());
    const status = dbCat ? '? Mapped to DB Category' : (p === 'PRIMARY (None)' ? '?? Top-Level / No Group' : '?? UNMAPPED GROUP');
    if (dbCat || p === 'PRIMARY (None)') mappedToDbCount += count;
    else {
      unmappedCount += count;
      unmappedGroups.add(p);
    }
    console.log(`  - "${p}": ${count} items -> ${status}`);
  }

  console.log(`\n• Items mapped to DB Category / Primary : ${mappedToDbCount} / ${items.length}`);
  if (unmappedCount > 0) {
    console.log(`?? Unmapped Items: ${unmappedCount}, Groups:`, Array.from(unmappedGroups));
  }

  console.log(`\n--- Stock Items by Base Unit of Measure ---`);
  for (const [u, count] of Object.entries(unitsCount)) {
    console.log(`  - "${u}": ${count} items`);
  }

  // Sample items with opening balance
  console.log(`\n--- Sample 5 Items with Opening Balance ---`);
  const sampleWithOb = items.filter(i => i.rawOb).slice(0, 5);
  console.log(JSON.stringify(sampleWithOb, null, 2));

  // Sample items with billing type
  console.log(`\n--- Billing Types breakdown ---`);
  const billingTypes = {};
  items.forEach(i => {
    const bt = i.billingType || 'None';
    billingTypes[bt] = (billingTypes[bt] || 0) + 1;
  });
  console.log(billingTypes);

  await client.end();
}

auditItems().catch(console.error);
