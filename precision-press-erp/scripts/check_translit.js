require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const http = require('http');

const TALLY_HOST = '127.0.0.1';
const TALLY_PORT = 9000;
const TARGET_COMPANY = 'Website Testing Hindustan';

function queryTally(payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: TALLY_HOST,
      port: TALLY_PORT,
      path: '',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function cleanStr(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function normalizeUnit(unit) {
  if (!unit) return 'FT';
  const u = unit.trim().toUpperCase();
  if (u === 'F' || u === 'FT' || u === 'FEET' || u === 'FOOT') return 'FT';
  if (u === 'I' || u === 'IN' || u === 'INCH' || u === 'INCHES') return 'IN';
  if (u === 'M' || u === 'MTR' || u === 'METER' || u === 'METERS') return 'M';
  if (u === 'MM') return 'MM';
  if (u === 'CM') return 'CM';
  return u;
}

async function resync() {
  console.log('=== 1. FETCHING ALL STOCK ITEMS FROM LIVE TALLY 9000 ===');
  const nativeExportXml = `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Export Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>List of Accounts</REPORTNAME>
    <STATICVARIABLES>
     <SVCURRENTCOMPANY>${TARGET_COMPANY}</SVCURRENTCOMPANY>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
     <ACCOUNTTYPE>Stock Items</ACCOUNTTYPE>
    </STATICVARIABLES>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;

  const xml = await queryTally(nativeExportXml);
  console.log(`Received ${xml.length} bytes from Tally 9000.`);

  const rawItems = xml.split('</STOCKITEM>');
  console.log(`Total STOCKITEM blocks in Tally 9000: ${rawItems.length - 1}`);

  let multiSizeCount = 0;
  let singleDefaultSizeCount = 0;
  let fixedNoSizeCount = 0;

  const updateTasks = [];

  for (const itemXml of rawItems) {
    const nameMatch = itemXml.match(/<STOCKITEM NAME="([^"]+)"/);
    if (!nameMatch) continue;
    const itemName = cleanStr(nameMatch[1]);
    if (!itemName) continue;

    const sizeNameMatches = itemXml.match(/<UDF:ITEMSIZENAMEUDF[^>]*>([^<]+)<\/UDF:ITEMSIZENAMEUDF>/g) || [];
    const isMandatory = itemXml.includes('IsItemSizeDetailsMandatory">Yes') || itemXml.includes('ISITEMSIZEDETAILSMANDATORY">Yes');

    // Extract size details
    const widthM = itemXml.match(/<UDF:ITEMWIDTHUDF[^>]*>([^<]+)<\/UDF:ITEMWIDTHUDF>/);
    const lengthM = itemXml.match(/<UDF:ITEMLENGTHUDF[^>]*>([^<]+)<\/UDF:ITEMLENGTHUDF>/);
    const widthUnitM = itemXml.match(/<UDF:ITEMWIDTHUNITUDF[^>]*>([^<]+)<\/UDF:ITEMWIDTHUNITUDF>/);
    const lengthUnitM = itemXml.match(/<UDF:ITEMLENGTHUNITUDF[^>]*>([^<]+)<\/UDF:ITEMLENGTHUNITUDF>/);
    const sizeNameM = itemXml.match(/<UDF:ITEMNEWSIZENAMEUDF[^>]*>([^<]+)<\/UDF:ITEMNEWSIZENAMEUDF>/) || itemXml.match(/<UDF:ITEMSIZENAMEUDF[^>]*>([^<]+)<\/UDF:ITEMSIZENAMEUDF>/);

    const defaultWidth = widthM ? parseFloat(widthM[1].trim()) || null : null;
    const defaultLength = lengthM ? parseFloat(lengthM[1].trim()) || null : null;
    const defaultWidthUnit = normalizeUnit(widthUnitM ? widthUnitM[1].trim() : 'FT');
    const defaultLengthUnit = normalizeUnit(lengthUnitM ? lengthUnitM[1].trim() : 'FT');
    const defaultSizeName = sizeNameM ? cleanStr(sizeNameM[1]) : null;

    let hasMultipleSizes = false;
    let hasSingleDefaultSize = false;

    if (sizeNameMatches.length > 1 || isMandatory) {
      hasMultipleSizes = true;
      multiSizeCount++;
    } else if (sizeNameMatches.length === 1 || (defaultWidth !== null && defaultLength !== null)) {
      hasMultipleSizes = false;
      hasSingleDefaultSize = true;
      singleDefaultSizeCount++;
    } else {
      hasMultipleSizes = false;
      hasSingleDefaultSize = false;
      fixedNoSizeCount++;
    }

    updateTasks.push(
      pool.query(
        `UPDATE inventory_item
         SET has_multiple_sizes = $1,
             default_width = $2,
             default_length = $3,
             default_width_unit = $4,
             default_length_unit = $5,
             default_size_name = $6,
             metadata = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   '{hasMultipleSizes}', to_jsonb($1::boolean)
                 ),
                 '{has_multiple_sizes}', to_jsonb($1::boolean)
               ),
               '{has_single_default_size}', to_jsonb($7::boolean)
             )
         WHERE LOWER(name) = LOWER($8) OR LOWER(tally_item_name) = LOWER($8);`,
        [
          hasMultipleSizes,
          hasSingleDefaultSize ? defaultWidth : null,
          hasSingleDefaultSize ? defaultLength : null,
          defaultWidthUnit,
          defaultLengthUnit,
          hasSingleDefaultSize ? defaultSizeName : null,
          hasSingleDefaultSize,
          itemName
        ]
      )
    );
  }

  console.log(`Running ${updateTasks.length} database updates...`);
  await Promise.all(updateTasks);

  console.log('\n=== TALLY 9000 RESYNC COMPLETED SUCCESSFULLY ===');
  console.log(`Updated ${updateTasks.length} items in PostgreSQL database.`);
  console.log(`  • Multiple Size Items (has_multiple_sizes = true): ${multiSizeCount}`);
  console.log(`  • Single Default Size Items (has_single_default_size = true, default W&L set): ${singleDefaultSizeCount}`);
  console.log(`  • Fixed No Size Items (has_multiple_sizes = false, W&L disabled): ${fixedNoSizeCount}`);
}

resync().catch(console.error).finally(() => pool.end());



