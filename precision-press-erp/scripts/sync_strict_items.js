const http = require('http');

function queryTally(reqXml) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 9000,
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

async function main() {
  console.log('1. Exporting ItemCol from Tally Port 9000...');
  const reqXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ItemCol</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>Website Testing Hindustan</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE>
<COLLECTION NAME="ItemCol">
  <TYPE>StockItem</TYPE>
  <FETCH>Name,Parent,BaseUnits,StkItemSizesBillingType,IsItemSizeDetailsMandatory</FETCH>
</COLLECTION>
</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

  const xml = await queryTally(reqXml);
  console.log(`Received XML of length ${xml.length}`);

  const itemRegex = /<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi;
  let m;
  const mandatoryYes = [];
  let total = 0;

  while ((m = itemRegex.exec(xml)) !== null) {
    total++;
    const name = cleanStr(m[1]);
    const body = m[2];
    const sizeM = body.match(/<UDF:ISITEMSIZEDETAILSMANDATORY[^>]*>([^<]+)<\/UDF:ISITEMSIZEDETAILSMANDATORY>/i);
    if (sizeM && cleanStr(sizeM[1]).toLowerCase() === 'yes') {
      mandatoryYes.push(name.toLowerCase());
    }
  }

  console.log(`Total items in Tally: ${total}, with ISITEMSIZEDETAILSMANDATORY = Yes: ${mandatoryYes.length}`);

  // Now connect to database
  console.log('\n2. Updating PostgreSQL database...');
  const { Pool } = require('pg');
  require('dotenv').config({ path: '.env.local' });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Reset all to false
  await pool.query(`
    UPDATE inventory_item
    SET has_multiple_sizes = false,
        metadata = jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{hasMultipleSizes}', 'false'::jsonb),
          '{has_multiple_sizes}', 'false'::jsonb
        )
  `);
  console.log('All items reset to has_multiple_sizes = false.');

  // Set only mandatory YES items to true
  if (mandatoryYes.length > 0) {
    const res = await pool.query(`
      UPDATE inventory_item
      SET has_multiple_sizes = true,
          metadata = jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{hasMultipleSizes}', 'true'::jsonb),
            '{has_multiple_sizes}', 'true'::jsonb
          )
      WHERE LOWER(name) = ANY($1)
    `, [mandatoryYes]);
    console.log(`Set has_multiple_sizes = true for exactly ${mandatoryYes.length} items where Tally master says YES!`);
  }

  const verify = await pool.query(`
    SELECT name, tally_stock_group, unit_of_measure, has_multiple_sizes 
    FROM inventory_item 
    WHERE name IN ('901 SPR - FL Ministar', '960 EPR - VNL Royal Glos', '01 Translit Max FX', '3750 Sunpack 3mm White- 325')
  `);
  console.table(verify.rows);

  await pool.end();
  console.log('Done!');
}

main().catch(console.error);
