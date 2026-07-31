require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  // Try to see if supabase_auth_admin role exists and its attributes
  const role = await client.query("SELECT rolname, rolcanlogin, rolsuper, rolinherit FROM pg_roles WHERE rolname IN ('supabase_auth_admin', 'postgres', 'supabase_admin')");
  console.log('Roles:', role.rows);

  // Check what extensions are installed
  const ext = await client.query("SELECT extname, extversion FROM pg_extension");
  console.log('Extensions:', ext.rows.map(r => r.extname).join(', '));
  
  client.end();
}).catch(console.error);
