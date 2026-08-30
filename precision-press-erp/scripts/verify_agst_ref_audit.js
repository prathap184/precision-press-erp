// scripts/verify_agst_ref_audit.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function check() {
  const client = postgres(process.env.DATABASE_URL);
  
  console.log('=== 1. BANK ACCOUNTS STATUS ===');
  const banks = await client`SELECT id, account_name, account_number, balance FROM bank_account`;
  console.table(banks);

  console.log('=== 2. CUSTOMER ADVANCE CREDIT (ADV-0001) ===');
  const credits = await client`
    SELECT cc.id, cc.original_amount, cc.amount_remaining, cc.status, je.reference, je.entry_number
    FROM customer_credit cc
    LEFT JOIN journal_entry je ON je.id = cc.journal_entry_id
  `;
  console.table(credits);

  console.log('=== 3. INVOICE INV-00045 ===');
  const invoices = await client`SELECT invoice_number, subtotal, tax_total, total, amount_paid, amount_due, status FROM invoice WHERE invoice_number = 'INV-00045'`;
  console.table(invoices);

  console.log('=== 4. PAYMENT RECORD & ALLOCATIONS ===');
  const payments = await client`
    SELECT p.payment_number, p.type, p.amount, p.reference, p.notes, pa.document_type, pa.document_id
    FROM payment p
    JOIN payment_allocation pa ON pa.payment_id = p.id
    WHERE p.notes ILIKE '%INV-00045%' OR p.notes ILIKE '%ADV-0001%'
  `;
  console.table(payments);

  console.log('=== 5. JOURNAL ENTRIES FOR THIS INVOICE ===');
  const entries = await client`
    SELECT je.entry_number, je.date, je.description, jl.debit_amount, jl.credit_amount, ca.code, ca.name as account_name
    FROM journal_entry je
    JOIN journal_line jl ON jl.journal_entry_id = je.id
    JOIN chart_account ca ON ca.id = jl.account_id
    WHERE je.reference = 'INV-00045' OR je.description ILIKE '%INV-00045%'
    ORDER BY je.created_at, jl.id
  `;
  console.table(entries);

  await client.end();
}

check().catch(console.error);
