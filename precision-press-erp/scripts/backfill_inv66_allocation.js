/**
 * Backfill script: Insert missing payment_allocation rows for INV-00066 ↔ REF-1
 *
 * Background:
 *   INV-00066 was settled against advance credit REF-1 (₹200) at creation time.
 *   The carrier payment row exists (270fe0e4-...) but the payment_allocation rows
 *   were never created due to a bug (undefined `entryId`). This script inserts them.
 *
 * Records:
 *   Invoice     INV-00066  99b263a6-72be-4249-aede-0df2b3c315cf  ₹200 paid
 *   Payment     REF-1      270fe0e4-da21-4ab7-813a-271b029aecab  ₹200
 *   Cust Credit REF-1 CC   6616f14e-f3b5-47c0-806d-7201b487d288  ₹200 (applied)
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL });

const INVOICE_ID    = '99b263a6-72be-4249-aede-0df2b3c315cf'; // INV-00066
const PAYMENT_ID    = '270fe0e4-da21-4ab7-813a-271b029aecab'; // REF-1 carrier payment
const CREDIT_ID     = '6616f14e-f3b5-47c0-806d-7201b487d288'; // customer_credit for REF-1
const AMOUNT        = 20000; // ₹200.00 in integer paise

async function run() {
  // 1. Safety check – verify records exist
  const inv = await pool.query(`SELECT id, invoice_number, amount_paid, status FROM invoice WHERE id = $1`, [INVOICE_ID]);
  if (!inv.rows.length) { console.error('Invoice not found!'); return; }
  console.log('Invoice:', inv.rows[0]);

  const pay = await pool.query(`SELECT id, payment_number, amount FROM payment WHERE id = $1`, [PAYMENT_ID]);
  if (!pay.rows.length) { console.error('Payment not found!'); return; }
  console.log('Payment:', pay.rows[0]);

  const cc = await pool.query(`SELECT id, status, amount_remaining FROM customer_credit WHERE id = $1`, [CREDIT_ID]);
  if (!cc.rows.length) { console.error('Customer credit not found!'); return; }
  console.log('Customer Credit:', cc.rows[0]);

  // 2. Check if already exists (idempotent)
  const existing = await pool.query(
    `SELECT * FROM payment_allocation WHERE payment_id = $1`,
    [PAYMENT_ID]
  );
  if (existing.rows.length > 0) {
    console.log('payment_allocation rows already exist for this payment:', existing.rows);
    console.log('Nothing to do.');
    return;
  }

  // 3. Insert the two missing allocation rows
  console.log('\nInserting payment_allocation rows...');

  await pool.query(`
    INSERT INTO payment_allocation (payment_id, document_type, document_id, amount)
    VALUES
      ($1, 'invoice',    $2, $3),
      ($1, 'prepayment', $4, $3)
  `, [PAYMENT_ID, INVOICE_ID, AMOUNT, CREDIT_ID]);

  console.log('✅ Done! Inserted 2 payment_allocation rows.');

  // 4. Verify
  const verify = await pool.query(`SELECT * FROM payment_allocation WHERE payment_id = $1`, [PAYMENT_ID]);
  console.log('Verification:', verify.rows);
}

run().catch(console.error).finally(() => pool.end());
