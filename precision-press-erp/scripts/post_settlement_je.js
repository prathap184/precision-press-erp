// scripts/post_settlement_je.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  // Find Accounts Receivable (1200) and Customer Deposits (2410)
  const [ar] = await sql`SELECT id FROM chart_account WHERE code = '1200' LIMIT 1`;
  const [dep] = await sql`SELECT id FROM chart_account WHERE code = '2410' LIMIT 1`;
  const [inv] = await sql`SELECT id, organization_id, invoice_number, issue_date, contact_id FROM invoice WHERE invoice_number = 'INV-00045'`;
  const [adv] = await sql`SELECT id FROM customer_credit WHERE original_amount = 100000`;
  const [pmt] = await sql`SELECT id FROM payment WHERE reference = 'ADV-0001'`;

  console.log('AR:', ar.id, 'Deposits:', dep.id, 'Invoice:', inv.id);

  // Check next entry number
  const [maxJe] = await sql`SELECT COALESCE(MAX(entry_number), 0) + 1 AS next_num FROM journal_entry WHERE organization_id = ${inv.organization_id}`;
  const entryNumber = maxJe.next_num;

  const desc = `Agst Ref Advance ADV-0001 applied to INV-00045`;
  const [je] = await sql`
    INSERT INTO journal_entry (
      organization_id, entry_number, date, description, reference, status, source_type, source_id, posted_at, created_by
    ) VALUES (
      ${inv.organization_id}, ${entryNumber}, ${inv.issue_date}, ${desc}, 'INV-00045', 'posted', 'customer_credit_application', ${adv.id}, NOW(), '00000000-0000-0000-0000-000000000001'
    ) RETURNING id;
  `;

  console.log('Created Journal Entry #', entryNumber, 'ID:', je.id);

  // Insert lines: DR Deposits 564.28, CR AR 564.28
  await sql`
    INSERT INTO journal_line (journal_entry_id, account_id, description, debit_amount, credit_amount, currency_code)
    VALUES 
      (${je.id}, ${dep.id}, ${desc}, 56428, 0, 'INR'),
      (${je.id}, ${ar.id}, ${desc}, 0, 56428, 'INR');
  `;

  // Update payment row with journal_entry_id
  if (pmt) {
    await sql`UPDATE payment SET journal_entry_id = ${je.id} WHERE id = ${pmt.id}`;
    console.log('Updated carrier payment with journalEntryId:', je.id);
  }

  console.log('✅ Double entry settlement successfully recorded in General Ledger!');
  await sql.end();
}

run().catch(console.error);
