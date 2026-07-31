require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  
  // 1. Search for anything like "Acme Corp" in contact table
  const acme = await client.query(`
    SELECT id, name, email, business_name, uid, status
    FROM contact
    WHERE 
      name ILIKE '%acme%' OR 
      business_name ILIKE '%acme%' OR
      email ILIKE '%acme%'
    LIMIT 10
  `);
  console.log('=== Acme Corp in contact table ===');
  console.log(acme.rows.length > 0 ? acme.rows : 'NOT FOUND');

  // 2. Check total customers in contact table
  const total = await client.query(`SELECT COUNT(*) FROM contact`);
  console.log('\n=== Total rows in contact ===', total.rows[0].count);

  // 3. Check for rows where uid IS NULL (broken records)
  const nullUid = await client.query(`
    SELECT id, name, email, uid FROM contact WHERE uid IS NULL LIMIT 5
  `);
  console.log('\n=== Rows with NULL uid ===');
  console.log(nullUid.rows.length > 0 ? nullUid.rows : 'None');

  // 4. Check for rows where id != uid (mismatch)
  const mismatch = await client.query(`
    SELECT id, uid, name, email FROM contact WHERE uid IS NOT NULL AND id::text != uid::text LIMIT 5
  `);
  console.log('\n=== Rows where id != uid ===');
  console.log(mismatch.rows.length > 0 ? mismatch.rows : 'None');

  // 5. Show all contact table column names
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'contact' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log('\n=== contact table columns ===');
  cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type}) nullable:${r.is_nullable}`));

  client.end();
}).catch(console.error);
