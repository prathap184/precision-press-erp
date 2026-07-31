
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(() => {
  return client.query('SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = \'auth\' AND table_name = \'users\'');
}).then(res => {
  console.log('Grants on auth.users:', res.rows);
  client.end();
}).catch(console.error);

