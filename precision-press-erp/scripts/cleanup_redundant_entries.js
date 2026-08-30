// scripts/cleanup_redundant_entries.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function clean() {
  const sql = postgres(process.env.DATABASE_URL);
  
  // Find journal entries with source_type = 'customer_credit_application'
  const entries = await sql`
    SELECT id, entry_number, description FROM journal_entry WHERE source_type = 'customer_credit_application'
  `;
  console.log('Found redundant journal entries to delete:', entries);

  for (const e of entries) {
    // Delete lines
    await sql`DELETE FROM journal_line WHERE journal_entry_id = ${e.id}`;
    // Clear journal_entry_id from any payment pointing to it
    await sql`UPDATE payment SET journal_entry_id = NULL WHERE journal_entry_id = ${e.id}`;
    // Delete entry
    await sql`DELETE FROM journal_entry WHERE id = ${e.id}`;
    console.log(`Deleted JE #${e.entry_number} (${e.description})`);
  }

  // Also set payment journal_entry_id for ADV-0001 to point directly to entry #3 (ADV-0001)
  const [advEntry] = await sql`SELECT id FROM journal_entry WHERE reference = 'ADV-0001' LIMIT 1`;
  if (advEntry) {
    await sql`UPDATE payment SET journal_entry_id = ${advEntry.id} WHERE reference = 'ADV-0001' AND payment_number = 'ADV-0001'`;
  }

  console.log('✅ Day Book & Transactions list successfully cleaned up!');
  await sql.end();
}

clean().catch(console.error);
