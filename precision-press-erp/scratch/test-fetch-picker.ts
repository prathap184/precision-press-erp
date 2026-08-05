import pg from 'pg';

async function testPort(port: number, user: string) {
  const pool = new pg.Pool({
    user,
    password: 'your-super-secret-and-long-postgres-password',
    host: '127.0.0.1',
    port,
    database: 'postgres',
    connectionTimeoutMillis: 3000
  });

  try {
    const res = await pool.query('SELECT count(*) FROM contact');
    console.log(`SUCCESS ON PORT ${port} (${user}):`, res.rows[0]);
    await pool.end();
  } catch (err: any) {
    console.error(`ERROR ON PORT ${port} (${user}):`, err.message);
    await pool.end();
  }
}

async function run() {
  await testPort(5433, 'postgres');
  await testPort(5433, 'postgres.your-tenant-id');
  await testPort(5432, 'postgres');
  await testPort(5432, 'postgres.your-tenant-id');
  process.exit(0);
}
run();
