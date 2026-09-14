require('dotenv').config({ path: '.env.local' });
const http = require('http');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const TALLY_HOST = 'localhost';
const TALLY_PORT = 9000;
const TARGET_COMPANY = 'Website Testing Hindustan';
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';

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
  console.log('=== 1. FETCHING ALL STOCK GROUPS FROM TALLY PORT 9000 ===');
  const groupXml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>GroupCol</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${TARGET_COMPANY}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE>
<COLLECTION NAME="GroupCol">
  <TYPE>StockGroup</TYPE>
  <FETCH>Name,Parent,Guid,AlterId,TreatSalesAsManufactured,TreatPurchasesAsConsumed,IgnoreNegativeStock,BaseUnits</FETCH>
</COLLECTION>
</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

  const groupData = await queryTally(groupXml);
  const groupRegex = /<STOCKGROUP\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKGROUP>/gi;
  let gm;
  const groupsToUpsert = [];

  while ((gm = groupRegex.exec(groupData)) !== null) {
    const name = cleanStr(gm[1]);
    const body = gm[2];

    const parentM = body.match(/<PARENT[^>]*>([^<]*)<\/PARENT>/i);
    const guidM = body.match(/<GUID[^>]*>([^<]*)<\/GUID>/i);
    const alterM = body.match(/<ALTERID[^>]*>([^<]*)<\/ALTERID>/i);
    const mfgM = body.match(/<TREATSALESASMANUFACTURED[^>]*>([^<]+)<\/TREATSALESASMANUFACTURED>/i);
    const consM = body.match(/<TREATPURCHASESASCONSUMED[^>]*>([^<]+)<\/TREATPURCHASESASCONSUMED>/i);
    const negM = body.match(/<IGNORENEGATIVESTOCK[^>]*>([^<]+)<\/IGNORENEGATIVESTOCK>/i);
    const uomM = body.match(/<BASEUNITS[^>]*>([^<]*)<\/BASEUNITS>/i);

    const parent = parentM ? cleanStr(parentM[1]) : '';
    const guid = guidM ? cleanStr(guidM[1]) : null;
    const alterId = alterM ? parseInt(alterM[1].trim(), 10) || null : null;
    const treatSalesAsMfg = mfgM ? cleanStr(mfgM[1]).toLowerCase() === 'yes' : false;
    const treatPurchasesConsumed = consM ? cleanStr(consM[1]).toLowerCase() === 'yes' : false;
    const ignoreNegStock = negM ? cleanStr(negM[1]).toLowerCase() === 'yes' : false;
    const uom = uomM ? cleanStr(uomM[1]) : '';

    groupsToUpsert.push({
      name,
      parent,
      guid,
      alterId,
      treatSalesAsMfg,
      treatPurchasesConsumed,
      ignoreNegStock,
      uom
    });
  }

  console.log(`Fetched ${groupsToUpsert.length} Stock Groups from Tally.`);

  console.log('\n=== 2. UPSERTING INTO inventory_category IN POSTGRESQL ===');
  const groupNameToId = new Map();

  for (const g of groupsToUpsert) {
    // Check existing by name or tally_stock_group
    const checkRes = await pool.query(
      `SELECT id FROM inventory_category WHERE LOWER(name) = LOWER($1) OR LOWER(tally_stock_group) = LOWER($1) LIMIT 1`,
      [g.name]
    );

    let catId;
    const meta = {
      parentGroup: g.parent || null,
      baseUnits: g.uom || null,
      treatSalesAsManufactured: g.treatSalesAsMfg,
      ignoreNegativeStock: g.ignoreNegStock,
      treatPurchasesAsConsumed: g.treatPurchasesConsumed,
    };

    if (checkRes.rows.length > 0) {
      catId = checkRes.rows[0].id;
      await pool.query(
        `UPDATE inventory_category 
         SET name = $1,
             tally_stock_group = $1,
             tally_guid = $2,
             alter_id = $3,
             treat_sales_as_manufactured = $4,
             ignore_negative_stock = $5,
             treat_purchases_as_consumed = $6,
             metadata = $7,
             updated_at = NOW()
         WHERE id = $8`,
        [g.name, g.guid, g.alterId, g.treatSalesAsMfg, g.ignoreNegStock, g.treatPurchasesConsumed, JSON.stringify(meta), catId]
      );
    } else {
      const insRes = await pool.query(
        `INSERT INTO inventory_category (
           organization_id, name, tally_stock_group, tally_guid, alter_id, 
           treat_sales_as_manufactured, ignore_negative_stock, treat_purchases_as_consumed, metadata, created_at, updated_at
         ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id`,
        [DEFAULT_ORG_ID, g.name, g.guid, g.alterId, g.treatSalesAsMfg, g.ignoreNegStock, g.treatPurchasesConsumed, JSON.stringify(meta)]
      );
      catId = insRes.rows[0].id;
    }
    groupNameToId.set(g.name.toLowerCase(), catId);
  }

  console.log(`Upserted ${groupNameToId.size} Stock Groups in inventory_category!`);

  // Link parent_id
  console.log('\n=== 3. LINKING PARENT_ID IN inventory_category ===');
  let linkedParentCount = 0;
  for (const g of groupsToUpsert) {
    if (g.parent && groupNameToId.has(g.parent.toLowerCase())) {
      const parentId = groupNameToId.get(g.parent.toLowerCase());
      const childId = groupNameToId.get(g.name.toLowerCase());
      if (parentId && childId && parentId !== childId) {
        await pool.query(`UPDATE inventory_category SET parent_id = $1 WHERE id = $2`, [parentId, childId]);
        linkedParentCount++;
      }
    }
  }
  console.log(`Linked ${linkedParentCount} groups with their parent categories.`);

  console.log('\n=== 4. SYNCING ITEMS TO FOLLOW GROUP TreatSalesAsManufactured ===');
  // Fetch categories with treat_sales_as_manufactured = true
  const mfgCatsRes = await pool.query(
    `SELECT id, name FROM inventory_category WHERE treat_sales_as_manufactured = true`
  );
  const mfgGroupNames = mfgCatsRes.rows.map(r => r.name);
  console.log(`Manufacturing / Plotter groups in database (${mfgGroupNames.length}):`, mfgGroupNames);

  // Link category_id for all items
  for (const [groupName, catId] of groupNameToId.entries()) {
    await pool.query(
      `UPDATE inventory_item 
       SET category_id = $1 
       WHERE (LOWER(category) = $2 OR LOWER(tally_stock_group) = $2) AND (category_id IS NULL OR category_id != $1)`,
      [catId, groupName]
    );
  }

  // Update items belonging to Manufacturing/Plotter groups to have multiple sizes enabled
  const updateMfgItemsRes = await pool.query(`
    UPDATE inventory_item
    SET has_multiple_sizes = true,
        default_width = COALESCE(default_width, 1),
        default_length = COALESCE(default_length, 1),
        default_width_unit = COALESCE(default_width_unit, 'FT'),
        default_length_unit = COALESCE(default_length_unit, 'FT'),
        default_size_name = COALESCE(default_size_name, '1 F x 1 F'),
        metadata = jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{hasMultipleSizes}', 'true'::jsonb),
            '{has_multiple_sizes}', 'true'::jsonb
          ),
          '{calcType}', '"SQFT"'::jsonb
        )
    WHERE category_id IN (
      SELECT id FROM inventory_category WHERE treat_sales_as_manufactured = true
    ) OR LOWER(tally_stock_group) = ANY($1)
    RETURNING id;
  `, [mfgGroupNames.map(g => g.toLowerCase())]);

  console.log(`Updated ${updateMfgItemsRes.rows.length} items under Manufacturing / Plotter groups to has_multiple_sizes = true!`);

  // Verify Sunpack
  const sunpackRes = await pool.query(`
    SELECT name, tally_stock_group, unit_of_measure, has_multiple_sizes 
    FROM inventory_item 
    WHERE LOWER(tally_stock_group) = 'sunpack'
    LIMIT 3;
  `);
  console.log('\nVerification of Sunpack items:');
  console.log(sunpackRes.rows);

  // Verify PrintX
  const printxRes = await pool.query(`
    SELECT name, tally_stock_group, unit_of_measure, has_multiple_sizes 
    FROM inventory_item 
    WHERE LOWER(tally_stock_group) = 'printx'
    LIMIT 3;
  `);
  console.log('\nVerification of PrintX items:');
  console.log(printxRes.rows);
}

run().catch(console.error).finally(() => pool.end());
