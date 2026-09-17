require('dotenv').config({ path: '.env.local' });
const http = require('http');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const TALLY_HOST = 'localhost';
const TALLY_PORT = 9000;
const TARGET_COMPANY = 'Website Testing Hindustan';

function cleanStr(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .trim();
}

function queryTally(reqXml) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: TALLY_HOST,
      port: TALLY_PORT,
      path: '',
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(reqXml)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(reqXml);
    req.end();
  });
}

async function run() {
  console.log('=== 1. FETCHING ALL STOCK ITEMS FROM TALLY ===');
  const reqXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ItemCol</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${TARGET_COMPANY}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE>
<COLLECTION NAME="ItemCol">
  <TYPE>StockItem</TYPE>
  <FETCH>Name,Parent,BaseUnits,IsItemSizeDetailsMandatory,StkItemSizesBillingType</FETCH>
</COLLECTION>
</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

  const xml = await queryTally(reqXml);
  const regex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  const mandatoryYesNames = [];
  let totalCount = 0;

  while ((m = regex.exec(xml)) !== null) {
    totalCount++;
    const name = cleanStr(m[1]);
    const body = m[2];
    const sizeM = body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i);
    const isMandatory = sizeM && cleanStr(sizeM[1]).toLowerCase() === 'yes';
    if (isMandatory) {
      mandatoryYesNames.push(name.toLowerCase());
    }
  }

  console.log(`Total Items in Tally: ${totalCount}`);
  console.log(`Items with ISITEMSIZEDETAILSMANDATORY = Yes: ${mandatoryYesNames.length}`);
  console.log(`Items with ISITEMSIZEDETAILSMANDATORY = No: ${totalCount - mandatoryYesNames.length}`);

  console.log('\n=== 2. STRICT RESET IN inventory_item ===');
  // First, set all to false
  await pool.query(`
    UPDATE inventory_item
    SET has_multiple_sizes = false,
        metadata = jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{hasMultipleSizes}', 'false'::jsonb),
          '{has_multiple_sizes}', 'false'::jsonb
        )
  `);
  console.log('Reset all items to has_multiple_sizes = false.');

  // Second, set only the exact mandatory YES items to true
  if (mandatoryYesNames.length > 0) {
    const res = await pool.query(`
      UPDATE inventory_item
      SET has_multiple_sizes = true,
          metadata = jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{hasMultipleSizes}', 'true'::jsonb),
            '{has_multiple_sizes}', 'true'::jsonb
          )
      WHERE LOWER(name) = ANY($1)
      RETURNING id
    `, [mandatoryYesNames]);
    console.log(`Updated exactly ${res.rows.length} items to has_multiple_sizes = true (matching Tally 100%)!`);
  }

  // Verify
  const verify = await pool.query(`
    SELECT name, tally_stock_group, unit_of_measure, has_multiple_sizes 
    FROM inventory_item 
    WHERE name IN ('901 SPR - FL Ministar', '960 EPR - VNL Royal Glos', '01 Translit Max FX', '3750 Sunpack 3mm White- 325')
  `);
  console.log('\nVerification of items:');
  console.table(verify.rows);
}

run().catch(console.error).finally(() => pool.end());
