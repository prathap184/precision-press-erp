import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Dropping public schema...');
  await db.execute(sql`DROP SCHEMA public CASCADE;`);
  console.log('Recreating public schema...');
  await db.execute(sql`CREATE SCHEMA public;`);
  await db.execute(sql`GRANT ALL ON SCHEMA public TO postgres;`);
  await db.execute(sql`GRANT ALL ON SCHEMA public TO public;`);
  console.log('Done resetting schema.');
  process.exit(0);
}

main().catch(console.error);
