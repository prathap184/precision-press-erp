const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';

async function run() {
  console.log('-----------------------------------------------------------------------');
  console.log('       ?? SYNCING TALLY GODOWN: "Main Location" ? public.warehouse     ');
  console.log('-----------------------------------------------------------------------\n');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query('BEGIN');

  try {
    // 1. Add tally columns if they do not exist
    await client.query(`
      ALTER TABLE public.warehouse 
      ADD COLUMN IF NOT EXISTS tally_guid text,
      ADD COLUMN IF NOT EXISTS alter_id bigint;
    `);
    console.log('? Added tally_guid and alter_id columns to public.warehouse.');

    // 2. Set existing dummy warehouses is_default = false
    await client.query(`
      UPDATE public.warehouse 
      SET is_default = false 
      WHERE organization_id = $1;
    `, [DEFAULT_ORG_ID]);

    // 3. Upsert Main Location
    const res = await client.query(`
      INSERT INTO public.warehouse (
        organization_id, name, code, is_default, is_active, tally_guid, alter_id
      ) VALUES (
        $1, 'Main Location', 'MAIN', true, true, 'f6834e73-e5aa-4df1-a17b-6135b3edda4f-0000003e', 478014
      )
      ON CONFLICT (organization_id, code) 
      DO UPDATE SET
        name = EXCLUDED.name,
        is_default = true,
        is_active = true,
        tally_guid = EXCLUDED.tally_guid,
        alter_id = EXCLUDED.alter_id,
        updated_at = now()
      RETURNING id, name, code, is_default, is_active, tally_guid, alter_id;
    `, [DEFAULT_ORG_ID]);

    console.log('? Main Location synchronized successfully:');
    console.table(res.rows);

    await client.query('COMMIT');
    console.log('?? TRANSACTION COMMITTED SUCCESSFULLY!');

    // Show all warehouses in DB
    const all = await client.query(`SELECT id, name, code, is_default, is_active, tally_guid FROM public.warehouse ORDER BY is_default DESC, name;`);
    console.log('\n--- All Warehouses in Database ---');
    console.table(all.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('? Error syncing Godown:', err.message);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
