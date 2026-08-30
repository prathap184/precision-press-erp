// scripts/backfill_agst_ref_payment.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not found");
    process.exit(1);
  }
  const client = postgres(connectionString);

  console.log("Checking invoice c49b3963-408d-4404-be7e-f48245999c4a...");
  
  const [inv] = await client`
    SELECT id, organization_id, contact_id, invoice_number, total, amount_paid, issue_date, currency_code
    FROM invoice
    WHERE id = 'c49b3963-408d-4404-be7e-f48245999c4a'
  `;

  if (!inv) {
    console.log("Invoice not found or already verified");
    await client.end();
    return;
  }

  console.log("Invoice found:", inv.invoice_number, "Amount Paid:", inv.amount_paid);

  // Check if payment already exists
  const existingAllocations = await client`
    SELECT id FROM payment_allocation WHERE document_id = ${inv.id}
  `;

  if (existingAllocations.length > 0) {
    console.log("Payment allocations already exist for this invoice.");
  } else {
    // Find customer credit for this contact
    const [credit] = await client`
      SELECT cc.id, cc.journal_entry_id, je.reference, je.entry_number
      FROM customer_credit cc
      LEFT JOIN journal_entry je ON je.id = cc.journal_entry_id
      WHERE cc.contact_id = ${inv.contact_id}
      ORDER BY cc.created_at DESC
      LIMIT 1
    `;

    const advRef = credit?.reference || credit?.entry_number || "ADV-0001";
    console.log("Linking to advance credit:", advRef);

    const [payment] = await client`
      INSERT INTO payment (
        organization_id, contact_id, payment_number, type, date, amount, method, reference, notes, currency_code
      ) VALUES (
        ${inv.organization_id}, ${inv.contact_id}, 'PAY-00045', 'received', ${inv.issue_date}, ${inv.amount_paid}, 'other', ${advRef}, ${'Settled against Advance Receipt ' + advRef}, ${inv.currency_code}
      ) RETURNING id
    `;

    if (credit) {
      await client`
        INSERT INTO payment_allocation (payment_id, document_type, document_id, amount)
        VALUES (${payment.id}, 'prepayment', ${credit.id}, ${inv.amount_paid})
      `;
    }

    await client`
      INSERT INTO payment_allocation (payment_id, document_type, document_id, amount)
      VALUES (${payment.id}, 'invoice', ${inv.id}, ${inv.amount_paid})
    `;

    console.log("Successfully created payment allocation for invoice", inv.invoice_number);
  }

  await client.end();
}

main().catch(console.error);
