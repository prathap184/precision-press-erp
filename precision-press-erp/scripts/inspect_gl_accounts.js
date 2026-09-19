const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT id, code, name, type 
    FROM chart_account 
    WHERE organization_id = '00000000-0000-0000-0000-000000000002' 
      AND code IN ('1300', '4000', '4010', '5000')
    ORDER BY code;
  `);
  console.table(res.rows);

  await client.end();
}

run().catch(console.error);
