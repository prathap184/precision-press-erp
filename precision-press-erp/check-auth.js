require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  // Check sequences
  const seqs = await client.query("SELECT sequencename, sequenceowner FROM pg_sequences WHERE schemaname = 'auth'");
  console.log('Sequences:', seqs.rows);
  
  // Check functions
  const fns = await client.query("SELECT proname, proowner::regrole FROM pg_proc WHERE pronamespace = 'auth'::regnamespace LIMIT 10");
  console.log('Functions (first 10):', fns.rows);
  
  // Check if schema_migrations has rows
  const mig = await client.query('SELECT * FROM auth.schema_migrations ORDER BY version DESC LIMIT 5');
  console.log('Latest migrations:', mig.rows);
  
  client.end();
}).catch(console.error);
