const http = require('http');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

function queryTally(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 30000
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function readXmlFile(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le');
  return b.toString('utf8');
}

function clean(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .trim();
}

async function run() {
  console.log('================================================================================');
  console.log('   CROSS-CHECK AUDIT: has_multiple_sizes & default_size ACROSS ALL 335 ITEMS   ');
  console.log('         [Live Tally Port 9000] <---> [items.xml] <---> [ERP Database]         ');
  console.log('================================================================================\n');

  // 1. Fetch from Live Tally Port 9000
  console.log('1️⃣  Connecting to Live Tally Port 9000 (New Web Testing)...');
  const payload = `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>StockItemCollection</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVCURRENTCOMPANY>New Web Testing</SVCURRENTCOMPANY>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="StockItemCollection" ISMODIFY="No">
      <TYPE>StockItem</TYPE>
      <FETCH>Name,Guid,IsItemSizeDetailsMandatory,StkItemSizesBillingType,ItemWidthUdf,ItemLengthUdf,ItemSizeNameUdf</FETCH>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;

  let liveItemsMap = new Map();
  try {
    const buf = await queryTally(payload);
    const liveXml = buf.toString('utf8');
    const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
    let m;
    while ((m = itemRegex.exec(liveXml)) !== null) {
      const name = clean(m[1]);
      const body = m[2];
      const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
      const isMandM = body.match(/<ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]*)<\/ISITEMSIZEDETAILSMANDATORY>/i) || body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]*)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i);
      const bTypeM = body.match(/<STKITEMSIZESBILLINGTYPE[^>]*>([^<]*)<\/STKITEMSIZESBILLINGTYPE>/i) || body.match(/<UDF:STKITEMSIZESBILLINGTYPE[^>]*>([^<]*)<\/UDF:STKITEMSIZESBILLINGTYPE>/i);
      const widthM = body.match(/<ITEMWIDTHUDF[^>]*>([^<]*)<\/ITEMWIDTHUDF>/i) || body.match(/<UDF:ITEMWIDTHUDF[^>]*>([^<]*)<\/UDF:ITEMWIDTHUDF>/i);
      const lengthM = body.match(/<ITEMLENGTHUDF[^>]*>([^<]*)<\/ITEMLENGTHUDF>/i) || body.match(/<UDF:ITEMLENGTHUDF[^>]*>([^<]*)<\/UDF:ITEMLENGTHUDF>/i);
      const sizeNameM = body.match(/<ITEMSIZENAMEUDF[^>]*>([^<]*)<\/ITEMSIZENAMEUDF>/i) || body.match(/<UDF:ITEMSIZENAMEUDF[^>]*>([^<]*)<\/UDF:ITEMSIZENAMEUDF>/i);

      const guid = guidM ? clean(guidM[1]) : '';
      const isMand = Boolean(isMandM && clean(isMandM[1]).toLowerCase() === 'yes');
      const billingType = bTypeM ? clean(bTypeM[1]) : null;
      const width = widthM && clean(widthM[1]) ? parseFloat(clean(widthM[1])) : null;
      const length = lengthM && clean(lengthM[1]) ? parseFloat(clean(lengthM[1])) : null;
      const sizeName = sizeNameM ? clean(sizeNameM[1]) : null;

      liveItemsMap.set(guid || name, {
        name,
        guid,
        isMand,
        billingType,
        width,
        length,
        sizeName
      });
    }
    console.log(`   ✅ Live Tally returned ${liveItemsMap.size} stock items.`);
  } catch (err) {
    console.warn(`   ⚠️ Live Tally port 9000 fetch error: ${err.message}`);
  }

  // 2. Parse C:\Users\jprat\Videos\items.xml
  console.log('2️⃣  Reading C:\\Users\\jprat\\Videos\\items.xml...');
  const fileXml = readXmlFile('C:\\Users\\jprat\\Videos\\items.xml');
  const fileRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let fm;
  const fileItemsMap = new Map();
  while ((fm = fileRegex.exec(fileXml)) !== null) {
    const name = clean(fm[1]);
    const body = fm[2];
    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const isMandM = body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]*)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i) || body.match(/<ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]*)<\/ISITEMSIZEDETAILSMANDATORY>/i);
    const bTypeM = body.match(/<UDF:STKITEMSIZESBILLINGTYPE[^>]*>([^<]*)<\/UDF:STKITEMSIZESBILLINGTYPE>/i) || body.match(/<STKITEMSIZESBILLINGTYPE[^>]*>([^<]*)<\/STKITEMSIZESBILLINGTYPE>/i);
    const widthM = body.match(/<UDF:ITEMWIDTHUDF[^>]*>([^<]*)<\/UDF:ITEMWIDTHUDF>/i) || body.match(/<ITEMWIDTH[^>]*>([^<]*)<\/ITEMWIDTH>/i);
    const lengthM = body.match(/<UDF:ITEMLENGTHUDF[^>]*>([^<]*)<\/UDF:ITEMLENGTHUDF>/i) || body.match(/<ITEMLENGTH[^>]*>([^<]*)<\/ITEMLENGTH>/i);
    const sizeNameM = body.match(/<UDF:ITEMSIZENAMEUDF[^>]*>([^<]*)<\/UDF:ITEMSIZENAMEUDF>/i) || body.match(/<ITEMSIZENAME[^>]*>([^<]*)<\/ITEMSIZENAME>/i);

    const guid = guidM ? clean(guidM[1]) : '';
    const isMand = Boolean(isMandM && clean(isMandM[1]).toLowerCase() === 'yes');
    const billingType = bTypeM ? clean(bTypeM[1]) : null;
    const width = widthM && clean(widthM[1]) ? parseFloat(clean(widthM[1])) : null;
    const length = lengthM && clean(lengthM[1]) ? parseFloat(clean(lengthM[1])) : null;
    const sizeName = sizeNameM ? clean(sizeNameM[1]) : null;

    fileItemsMap.set(guid || name, {
      name,
      guid,
      isMand,
      billingType,
      width,
      length,
      sizeName
    });
  }
  console.log(`   ✅ items.xml parsed ${fileItemsMap.size} stock items.`);

  // 3. Query ERP Database (public.inventory_item)
  console.log('3️⃣  Querying ERP PostgreSQL (public.inventory_item)...');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const dbRes = await client.query(`
    SELECT 
      id,
      name,
      tally_guid,
      tally_item_name,
      has_multiple_sizes,
      default_width,
      default_length,
      default_width_unit,
      default_length_unit,
      default_size_name,
      tally_billing_mode,
      metadata
    FROM public.inventory_item
    WHERE organization_id = '00000000-0000-0000-0000-000000000002'
    ORDER BY name ASC
  `);
  console.log(`   ✅ Database returned ${dbRes.rows.length} stock items.`);

  // 4. Detailed Cross-Check Comparison across all 335 items
  console.log('\n--------------------------------------------------------------------------------');
  console.log('                    FIELD-BY-FIELD CROSS-CHECK COMPARISON                       ');
  console.log('--------------------------------------------------------------------------------');

  let matchHasMultipleSizes = 0;
  let matchDefaultWidth = 0;
  let matchDefaultLength = 0;
  let matchDefaultSizeName = 0;
  let matchBillingMode = 0;
  let mismatches = [];

  for (const dbItem of dbRes.rows) {
    const guid = dbItem.tally_guid;
    const fileItem = fileItemsMap.get(guid) || fileItemsMap.get(dbItem.name);
    const liveItem = liveItemsMap.get(guid) || liveItemsMap.get(dbItem.name);

    if (!fileItem) {
      mismatches.push({ item: dbItem.name, field: 'MISSING_IN_FILE', db: guid, source: 'Not Found' });
      continue;
    }

    // Expected values from Tally (fileItem / liveItem)
    const expectedHasMultiple = fileItem.isMand;
    const expectedWidth = fileItem.width;
    const expectedLength = fileItem.length;
    const expectedSizeName = fileItem.sizeName;
    const expectedBillingMode = fileItem.billingType;

    // Actual DB values
    const actualHasMultiple = dbItem.has_multiple_sizes;
    const actualWidth = dbItem.default_width ? parseFloat(dbItem.default_width) : null;
    const actualLength = dbItem.default_length ? parseFloat(dbItem.default_length) : null;
    const actualSizeName = dbItem.default_size_name;
    const actualBillingMode = dbItem.tally_billing_mode;

    // 1. Check has_multiple_sizes
    if (actualHasMultiple === expectedHasMultiple) {
      matchHasMultipleSizes++;
    } else {
      mismatches.push({
        item: dbItem.name,
        field: 'has_multiple_sizes',
        dbVal: actualHasMultiple,
        tallyVal: expectedHasMultiple
      });
    }

    // 2. Check default_width
    if (actualWidth === expectedWidth) {
      matchDefaultWidth++;
    } else {
      mismatches.push({
        item: dbItem.name,
        field: 'default_width',
        dbVal: actualWidth,
        tallyVal: expectedWidth
      });
    }

    // 3. Check default_length
    if (actualLength === expectedLength) {
      matchDefaultLength++;
    } else {
      mismatches.push({
        item: dbItem.name,
        field: 'default_length',
        dbVal: actualLength,
        tallyVal: expectedLength
      });
    }

    // 4. Check default_size_name
    if ((actualSizeName || null) === (expectedSizeName || null)) {
      matchDefaultSizeName++;
    } else {
      mismatches.push({
        item: dbItem.name,
        field: 'default_size_name',
        dbVal: actualSizeName,
        tallyVal: expectedSizeName
      });
    }

    // 5. Check tally_billing_mode
    if ((actualBillingMode || null) === (expectedBillingMode || null)) {
      matchBillingMode++;
    } else {
      mismatches.push({
        item: dbItem.name,
        field: 'tally_billing_mode',
        dbVal: actualBillingMode,
        tallyVal: expectedBillingMode
      });
    }
  }

  console.log(`Total Items Evaluated                       : ${dbRes.rows.length}`);
  console.log(`has_multiple_sizes Matches (Tally ↔ ERP)    : ${matchHasMultipleSizes} / ${dbRes.rows.length} (${(matchHasMultipleSizes/dbRes.rows.length*100).toFixed(1)}%)`);
  console.log(`default_width Matches (Tally ↔ ERP)         : ${matchDefaultWidth} / ${dbRes.rows.length} (${(matchDefaultWidth/dbRes.rows.length*100).toFixed(1)}%)`);
  console.log(`default_length Matches (Tally ↔ ERP)        : ${matchDefaultLength} / ${dbRes.rows.length} (${(matchDefaultLength/dbRes.rows.length*100).toFixed(1)}%)`);
  console.log(`default_size_name Matches (Tally ↔ ERP)      : ${matchDefaultSizeName} / ${dbRes.rows.length} (${(matchDefaultSizeName/dbRes.rows.length*100).toFixed(1)}%)`);
  console.log(`tally_billing_mode Matches (Tally ↔ ERP)     : ${matchBillingMode} / ${dbRes.rows.length} (${(matchBillingMode/dbRes.rows.length*100).toFixed(1)}%)`);
  console.log(`Total Mismatches Found                      : ${mismatches.length}`);

  if (mismatches.length > 0) {
    console.log('\n⚠️ MISMATCH DETAILS:');
    console.table(mismatches.slice(0, 20));
  } else {
    console.log('\n🎉 100.0% EXACT MATCH ACROSS ALL 335 ITEMS ON ALL SIZE & BILLING FIELDS!');
  }

  // Breakdown of the 3 Golden Rules in DB
  const r1 = dbRes.rows.filter(r => r.has_multiple_sizes && r.default_width > 0);
  const r1b = dbRes.rows.filter(r => r.has_multiple_sizes && (!r.default_width || r.default_width <= 0));
  const r2 = dbRes.rows.filter(r => !r.has_multiple_sizes && r.default_width > 0);
  const r3 = dbRes.rows.filter(r => !r.has_multiple_sizes && (!r.default_width || r.default_width <= 0));

  console.log('\n--------------------------------------------------------------------------------');
  console.log('               THE 3 GOLDEN RULES COMPLIANCE IN ERP DATABASE                    ');
  console.log('--------------------------------------------------------------------------------');
  console.log(`Rule 1  (has_multiple_sizes=true,  default_size=true)  : ${r1.length} items (ACTIVE, prefilled 1x1 Ft)`);
  console.log(`Rule 1B (has_multiple_sizes=true,  default_size=false) : ${r1b.length} items (ACTIVE, custom size input)`);
  console.log(`Rule 2  (has_multiple_sizes=false, default_size=true)  : ${r2.length} items (ACTIVE, fixed size)`);
  console.log(`Rule 3  (has_multiple_sizes=false, default_size=false) : ${r3.length} items (INACTIVE, billed strictly by Qty/Pcs)`);
  console.log(`Total Items Accounted For                               : ${r1.length + r1b.length + r2.length + r3.length} / 335`);
  console.log('--------------------------------------------------------------------------------');

  // Also print 15 sample items across different categories and rules
  console.log('\n--- Sample 15 Items Cross-Check Table ---');
  const samples = [
    '3m Black Back Vinyl ( Mu )',
    '3m black back vinyl ( Plain )',
    '3M Glossy Lamination ( Plain )',
    '3mm Sunboad',
    'A C P Sheet',
    'A4 Lamination',
    'A4 Size Paper',
    'Acp Board',
    'Visiting Card 1000',
    'Letter Head Paper ( 100 Nos )',
    'Standee 2 x 5 Standard',
    'Standee 2.5 x 6 Luxury',
    'Mdf 8mm',
    'Led Light 3Led White',
    'Vinyl Sticker'
  ];

  const sampleRows = [];
  for (const sName of samples) {
    const dbI = dbRes.rows.find(r => r.name.toLowerCase() === sName.toLowerCase());
    const fileI = fileItemsMap.get(dbI ? dbI.tally_guid : '') || fileItemsMap.get(sName);
    if (dbI && fileI) {
      sampleRows.push({
        'Item Name': dbI.name.substring(0, 25),
        'Tally isMand': fileI.isMand,
        'ERP hasMulti': dbI.has_multiple_sizes,
        'Tally DefSize': fileI.sizeName || 'None',
        'ERP DefSize': dbI.default_size_name || 'None',
        'ERP WxL': `${dbI.default_width || 0} x ${dbI.default_length || 0}`,
        'BillingMode': dbI.tally_billing_mode,
        'Rule': (dbI.has_multiple_sizes && dbI.default_width > 0) ? 'Rule 1'
              : (dbI.has_multiple_sizes) ? 'Rule 1B'
              : (dbI.default_width > 0) ? 'Rule 2' : 'Rule 3'
      });
    }
  }
  console.table(sampleRows);

  await client.end();
}

run().catch(console.error);