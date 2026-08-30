// scripts/check_double_entry.js
require('dotenv').config({ path: '.env.local' });
const postgres = require('postgres');

async function run() {
  const sql = postgres(process.env.DATABASE_URL);
  
  console.log('--- ALL JOURNAL ENTRIES & THEIR LINES ---');
  const entries = await sql`
    SELECT je.entry_number, je.description, je.reference, jl.debit_amount, jl.credit_amount, ca.code, ca.name
    FROM journal_entry je
    JOIN journal_line jl ON jl.journal_entry_id = je.id
    JOIN chart_account ca ON ca.id = jl.account_id
    ORDER BY je.entry_number ASC, jl.debit_amount DESC;
  `;
  
  for (const row of entries) {
    console.log(`[JE #${row.entry_number} - ${row.reference || row.description}] ${row.code} ${row.name} | Dr: ₹${(Number(row.debit_amount)/100).toFixed(2)} | Cr: ₹${(Number(row.credit_amount)/100).toFixed(2)}`);
  }

  // Also check Customer Deposits account and Accounts Receivable account balances
  console.log('\n--- GL ACCOUNT TOTAL BALANCES ---');
  const glBalances = await sql`
    SELECT ca.code, ca.name, ca.type,
      COALESCE(SUM(jl.debit_amount), 0) AS total_dr,
      COALESCE(SUM(jl.credit_amount), 0) AS total_cr
    FROM chart_account ca
    LEFT JOIN journal_line jl ON jl.account_id = ca.id
    LEFT JOIN journal_entry je ON je.id = jl.journal_entry_id AND je.deleted_at IS NULL
    WHERE ca.code IN ('1100', '1200', '2410', '4000', '2201', '2202')
    GROUP BY ca.id, ca.code, ca.name, ca.type
    ORDER BY ca.code ASC;
  `;

  for (const b of glBalances) {
    const dr = Number(b.total_dr) / 100;
    const cr = Number(b.total_cr) / 100;
    console.log(`${b.code} ${b.name} (${b.type}) | Total Dr: ₹${dr.toFixed(2)} | Total Cr: ₹${cr.toFixed(2)} | Net: ₹${(dr - cr).toFixed(2)}`);
  }
  
  await sql.end();
}
run().catch(console.error);
