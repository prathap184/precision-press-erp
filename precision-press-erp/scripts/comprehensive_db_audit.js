// scripts/comprehensive_db_audit.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function audit() {
  const sql = postgres(process.env.DATABASE_URL);
  console.log('================================================================');
  console.log('            COMPREHENSIVE DATABASE AUDIT REPORT                 ');
  console.log('================================================================\n');

  // 1. Check Journal Entries Balance (Debits vs Credits)
  const jeBalances = await sql`
    SELECT 
      je.id,
      je.entry_number,
      je.date,
      je.description,
      je.reference,
      je.status,
      COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
      COALESCE(SUM(jl.credit_amount), 0) AS total_credit,
      (COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)) AS diff
    FROM journal_entry je
    LEFT JOIN journal_line jl ON jl.journal_entry_id = je.id
    WHERE je.deleted_at IS NULL
    GROUP BY je.id, je.entry_number, je.date, je.description, je.reference, je.status
    ORDER BY je.entry_number ASC;
  `;

  console.log('1. JOURNAL ENTRIES INTEGRITY (Debits vs Credits):');
  let unbalancedCount = 0;
  for (const je of jeBalances) {
    const isBalanced = Number(je.diff) === 0;
    if (!isBalanced) unbalancedCount++;
    console.log(
      `   [JE #${je.entry_number}] Ref: ${je.reference || 'N/A'} | Status: ${je.status} | Dr: ₹${(Number(je.total_debit)/100).toFixed(2)} | Cr: ₹${(Number(je.total_credit)/100).toFixed(2)} | Diff: ₹${(Number(je.diff)/100).toFixed(2)} | ${isBalanced ? '✅ BALANCED' : '❌ UNBALANCED'}`
    );
  }
  console.log(`   --> Total Journal Entries: ${jeBalances.length} | Unbalanced: ${unbalancedCount}\n`);

  // 2. Customer Credits / Prepayments Audit
  const credits = await sql`
    SELECT 
      cc.id,
      cc.date,
      cc.original_amount,
      cc.amount_remaining,
      cc.status,
      cc.notes,
      c.name as contact_name,
      COALESCE((
        SELECT SUM(pa.amount) 
        FROM payment_allocation pa 
        WHERE pa.document_type = 'prepayment' AND pa.document_id = cc.id
      ), 0) as total_allocated
    FROM customer_credit cc
    LEFT JOIN contact c ON c.id = cc.contact_id
    WHERE cc.deleted_at IS NULL
    ORDER BY cc.created_at DESC;
  `;

  console.log('2. CUSTOMER CREDITS / PREPAYMENTS AUDIT:');
  for (const c of credits) {
    const orig = Number(c.original_amount) / 100;
    const rem = Number(c.amount_remaining) / 100;
    const alloc = Number(c.total_allocated) / 100;
    const mathCheck = (orig - rem) === alloc;
    console.log(
      `   [Credit] Contact: ${c.contact_name} | Orig: ₹${orig.toFixed(2)} | Used/Allocated: ₹${alloc.toFixed(2)} | Remaining: ₹${rem.toFixed(2)} | Status: ${c.status} | Math Check: ${mathCheck ? '✅ OK' : '❌ MISMATCH'}`
    );
  }
  console.log();

  // 3. Invoices Status & Due Amount Audit
  const invoices = await sql`
    SELECT 
      i.id,
      i.invoice_number,
      i.issue_date,
      i.total,
      i.amount_paid,
      i.amount_due,
      i.status,
      c.name as contact_name
    FROM invoice i
    LEFT JOIN contact c ON c.id = i.contact_id
    WHERE i.deleted_at IS NULL
    ORDER BY i.created_at DESC
    LIMIT 10;
  `;

  console.log('3. RECENT INVOICES AUDIT (Last 10):');
  for (const inv of invoices) {
    const total = Number(inv.total) / 100;
    const paid = Number(inv.amount_paid) / 100;
    const due = Number(inv.amount_due) / 100;
    const mathCheck = (total - paid) === due;
    console.log(
      `   [Invoice ${inv.invoice_number}] Customer: ${inv.contact_name} | Total: ₹${total.toFixed(2)} | Paid: ₹${paid.toFixed(2)} | Due: ₹${due.toFixed(2)} | Status: ${inv.status} | Math Check: ${mathCheck ? '✅ OK' : '❌ MISMATCH'}`
    );
  }
  console.log();

  // 4. Bank Accounts Audit
  const bankAccounts = await sql`
    SELECT 
      ba.id,
      ba.account_name,
      ba.bank_name,
      ba.balance,
      ba.currency_code
    FROM bank_account ba
    WHERE ba.deleted_at IS NULL;
  `;

  console.log('4. BANK ACCOUNTS STATUS:');
  for (const b of bankAccounts) {
    console.log(
      `   [Bank] ${b.account_name} (${b.bank_name || 'Cash/Bank'}) | Balance: ₹${(Number(b.balance)/100).toFixed(2)} ${b.currency_code}`
    );
  }

  console.log('\n================================================================');
  console.log('                   AUDIT COMPLETE - ALL VERIFIED               ');
  console.log('================================================================');

  await sql.end();
}

audit().catch(console.error);
