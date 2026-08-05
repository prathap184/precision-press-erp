import { Client } from 'pg';

async function testConn() {
  const url = "postgresql://postgres:your-super-secret-and-long-postgres-password@127.0.0.1:5433/postgres";
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const res = await client.query('SELECT current_database(), current_user, COUNT(*) FROM organization');
    console.log(`✅ DB SUCCESS:`, res.rows[0]);
    await client.end();
  } catch (err: any) {
    console.error(`❌ DB FAILED:`, err.message);
    try { await client.end(); } catch {}
  }
}
testConn();
