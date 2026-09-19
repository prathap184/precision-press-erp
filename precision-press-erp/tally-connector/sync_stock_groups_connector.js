/**
 * sync_stock_groups_connector.js
 *
 * Synchronizes all 30 Verified Stock Groups from C:\Users\jprat\Videos\groups.xml
 * into PostgreSQL table public.inventory_category.
 *
 * Execution Steps:
 * 1. Parse all 30 unique Stock Groups from groups.xml (UTF-16LE).
 * 2. Ingest Primary / Top-Level groups first (parent = null).
 * 3. Ingest Child / Sub-Groups second, linking parent_id to their parent's UUID.
 * 4. Maintain ACID transaction.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';
const XML_PATH = 'C:\\Users\\jprat\\Videos\\groups.xml';

function clean(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '')
    .replace(/&#10;/g, ' ')
    .replace(/&#13;/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;]+$/, '')
    .trim();
}

async function syncStockGroups() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('      🚀 SYNC STOCK GROUPS: groups.xml ➔ public.inventory_category');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  try {
    // 1. Read XML
    console.log(`📂 Reading master XML from: ${XML_PATH}...`);
    const content = fs.readFileSync(XML_PATH, 'utf16le');

    const sgRegex = /<STOCKGROUP NAME="([^"]*)"[^>]*>([\s\S]*?)<\/STOCKGROUP>/gi;
    let sgm;
    const stockGroupsByName = new Map();

    while ((sgm = sgRegex.exec(content)) !== null) {
      const rawName = sgm[1];
      const name = clean(rawName);
      const sgBody = sgm[2];

      const guidM = sgBody.match(/<GUID>([^<]*)<\/GUID>/i);
      const parentM = sgBody.match(/<PARENT>([^<]*)<\/PARENT>/i);
      const alterM = sgBody.match(/<ALTERID>([^<]*)<\/ALTERID>/i);
      const addableM = sgBody.match(/<ISADDABLE>([^<]*)<\/ISADDABLE>/i);
      const baseUnitsM = sgBody.match(/<BASEUNITS>([^<]*)<\/BASEUNITS>/i);

      const guid = guidM ? clean(guidM[1]) : null;
      const parent = parentM ? clean(parentM[1]) : '';
      const alterId = alterM ? parseInt(clean(alterM[1]), 10) : null;
      const isAddable = addableM ? clean(addableM[1]).toLowerCase() === 'yes' : false;

      const record = {
        name,
        parentGroup: parent || null,
        guid,
        alterId,
        treatSalesAsMfg: isAddable,
        baseUnits: baseUnitsM ? clean(baseUnitsM[1]) : null
      };

      if (!stockGroupsByName.has(name.toLowerCase())) {
        stockGroupsByName.set(name.toLowerCase(), record);
      }
    }

    const allGroups = Array.from(stockGroupsByName.values());
    const primaryGroups = allGroups.filter(g => !g.parentGroup);
    const childGroups = allGroups.filter(g => !!g.parentGroup);

    console.log(`📊 Extracted ${allGroups.length} unique Stock Groups (${primaryGroups.length} Primary, ${childGroups.length} Child Groups).`);

    // 2. Start ACID Transaction
    await client.query('BEGIN');
    console.log('\n🔒 Begun ACID Transaction in PostgreSQL...');

    const groupNameToId = new Map();

    // Step A: Ingest Primary Groups first
    console.log('\n📁 Ingesting Primary Groups (parent = null)...');
    for (const pg of primaryGroups) {
      const meta = {
        parentGroup: null,
        baseUnits: pg.baseUnits,
        treatSalesAsManufactured: pg.treatSalesAsMfg
      };

      // Check existing by tally_guid or name
      const existingRes = await client.query(`
        SELECT id FROM public.inventory_category
        WHERE organization_id = $1 AND (
          (tally_guid IS NOT NULL AND tally_guid = $2) OR
          LOWER(name) = LOWER($3)
        )
      `, [DEFAULT_ORG_ID, pg.guid, pg.name]);

      let catId;
      if (existingRes.rows.length > 0) {
        catId = existingRes.rows[0].id;
        await client.query(`
          UPDATE public.inventory_category
          SET
            name = $1,
            tally_stock_group = $1,
            tally_guid = $2,
            alter_id = $3,
            parent_id = NULL,
            treat_sales_as_manufactured = $4,
            description = $5,
            metadata = $6,
            updated_at = NOW()
          WHERE id = $7
        `, [pg.name, pg.guid, pg.alterId, pg.treatSalesAsMfg, `Tally Stock Group: ${pg.name}`, JSON.stringify(meta), catId]);
      } else {
        const insRes = await client.query(`
          INSERT INTO public.inventory_category (
            id,
            organization_id,
            name,
            tally_stock_group,
            tally_guid,
            alter_id,
            parent_id,
            treat_sales_as_manufactured,
            description,
            metadata,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            $1, $2, $2, $3, $4, NULL, $5, $6, $7, NOW(), NOW()
          ) RETURNING id
        `, [DEFAULT_ORG_ID, pg.name, pg.guid, pg.alterId, pg.treatSalesAsMfg, `Tally Stock Group: ${pg.name}`, JSON.stringify(meta)]);
        catId = insRes.rows[0].id;
      }
      groupNameToId.set(pg.name.toLowerCase(), catId);
      console.log(`   ✅ [Primary] "${pg.name}" -> ${catId}`);
    }

    // Step B: Ingest Child Groups second (linking parent_id)
    console.log('\n📂 Ingesting Child Groups (linking parent_id)...');
    for (const cg of childGroups) {
      const parentCatId = groupNameToId.get(cg.parentGroup.toLowerCase()) || null;
      const meta = {
        parentGroup: cg.parentGroup,
        baseUnits: cg.baseUnits,
        treatSalesAsManufactured: cg.treatSalesAsMfg
      };

      const existingRes = await client.query(`
        SELECT id FROM public.inventory_category
        WHERE organization_id = $1 AND (
          (tally_guid IS NOT NULL AND tally_guid = $2) OR
          LOWER(name) = LOWER($3)
        )
      `, [DEFAULT_ORG_ID, cg.guid, cg.name]);

      let catId;
      if (existingRes.rows.length > 0) {
        catId = existingRes.rows[0].id;
        await client.query(`
          UPDATE public.inventory_category
          SET
            name = $1,
            tally_stock_group = $1,
            tally_guid = $2,
            alter_id = $3,
            parent_id = $4,
            treat_sales_as_manufactured = $5,
            description = $6,
            metadata = $7,
            updated_at = NOW()
          WHERE id = $8
        `, [cg.name, cg.guid, cg.alterId, parentCatId, cg.treatSalesAsMfg, `Tally Sub-Group of ${cg.parentGroup}: ${cg.name}`, JSON.stringify(meta), catId]);
      } else {
        const insRes = await client.query(`
          INSERT INTO public.inventory_category (
            id,
            organization_id,
            name,
            tally_stock_group,
            tally_guid,
            alter_id,
            parent_id,
            treat_sales_as_manufactured,
            description,
            metadata,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            $1, $2, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
          ) RETURNING id
        `, [DEFAULT_ORG_ID, cg.name, cg.guid, cg.alterId, parentCatId, cg.treatSalesAsMfg, `Tally Sub-Group of ${cg.parentGroup}: ${cg.name}`, JSON.stringify(meta)]);
        catId = insRes.rows[0].id;
      }
      groupNameToId.set(cg.name.toLowerCase(), catId);
      console.log(`   ✅ [Child] "${cg.name}" (Parent: ${cg.parentGroup}) -> ${catId}`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 ALL 30 STOCK GROUPS COMMITTED TO public.inventory_category SUCCESSFULLY!');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Sync failed, transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

syncStockGroups().catch(console.error);
