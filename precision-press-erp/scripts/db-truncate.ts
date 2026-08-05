import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Truncating all tables...');
  
  // Get all tables in public schema
  const result = await db.execute(sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  `);
  
  // drizzle-orm/postgres-js returns result as an array of rows, wait, postgres.js returns array directly. But if we use node-postgres it returns { rows: [] }. Let's handle both.
  const rows = Array.isArray(result) ? result : result.rows;
  const tables = rows.map((r: any) => r.tablename);
  
  if (tables.length > 0) {
    const truncateQuery = `TRUNCATE TABLE ${tables.map((t: string) => `"${t}"`).join(', ')} CASCADE;`;
    console.log('Executing:', truncateQuery);
    await db.execute(sql.raw(truncateQuery));
  }
  
  console.log('Done truncating.');
  process.exit(0);
}

main().catch(console.error);
