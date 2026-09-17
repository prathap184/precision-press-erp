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
  console.log('=== 1. FETCHING ALL 1,801 ITEMS STRICTLY FROM TALLY MASTER ===');
  const reqXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Col</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${TARGET_COMPANY}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE>
<COLLECTION NAME="Col">
  <TYPE>StockItem</TYPE>
  <FETCH>Name,Parent,BaseUnits,IsItemSizeDetailsMandatory,StkItemSizesBillingType</FETCH>
</COLLECTION>
</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

  const xml = await queryTally(reqXml);
  const regex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  const itemsMap = new Map();

  while ((m = regex.exec(xml)) !== null) {
    const name = cleanStr(m[1]);
    const body = m[2];
    const sizeM = body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i);
    const isMandatory = sizeM && cleanStr(sizeM[1]).toLowerCase() === 'yes';
    itemsMap.set(name.toLowerCase(), isMandatory);
  }

  console.log(`Fetched ${itemsMap.size} items from Tally.`);
  const yesCount = [...itemsMap.values()].filter(Boolean).length;
  const noCount = [...itemsMap.values()].filter(v => !v).length;
  console.log(`Strict Tally Master Counts: Mandatory YES = ${yesCount}, Mandatory NO = ${noCount}`);

  console.log('\n=== 2. RESETTING has_multiple_sizes IN inventory_item TO MATCH TALLY STRICTLY ===');
  let updatedCount = 0;
  for (const [lowerName, isMandatory] of itemsMap.entries()) {
    await pool.query(
      `UPDATE inventory_item
       SET has_multiple_sizes = $1,
           metadata = jsonb_set(
             jsonb_set(COALESCE(metadata, '{}'::jsonb), '{hasMultipleSizes}', $2::jsonb),
             '{has_multiple_sizes}', $2::jsonb
           )
       WHERE LOWER(name) = $3`,
      [isMandatory, isMandatory ? 'true' : 'false', lowerName]
    );
    updatedCount++;
  }

  console.log(`Updated ${updatedCount} items in inventory_item to strictly match Tally!`);

  // Verify sample items:
  const testItems = await pool.query(`
    SELECT name, tally_stock_group, unit_of_measure, has_multiple_sizes 
    FROM inventory_item 
    WHERE name IN ('901 SPR - FL Ministar', '960 EPR - VNL Royal Glos', '01 Translit Max FX', '3750 Sunpack 3mm White- 325')
  `);
  console.log('\nVerification of items:');
  console.table(testItems.rows);
}

run().catch(console.error).finally(() => pool.end());
