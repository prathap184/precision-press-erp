// scripts/check_pg_rec_00036.js
require('dotenv').config({ path: '.env.local' });
const { db } = require('../src/lib/db');
const { payment, customerCredit, journalEntry } = require('../src/lib/db/schema');
const { eq, or, ilike } = require('drizzle-orm');

async function check() {
  console.log('=== CHECKING POSTGRESQL DB FOR REC-00036 ===');

  // 1. Check payments
  const pList = await db.select().from(payment).limit(5);
  console.log('\nRecent Payments:');
  pList.forEach(p => console.log(`ID: ${p.id} | No: ${p.paymentNumber} | Ref: ${p.reference} | Amt: ${p.amount} | Type: ${p.type}`));

  // 2. Check journal entries
  const jList = await db.select().from(journalEntry).limit(5);
  console.log('\nRecent Journal Entries:');
  jList.forEach(j => console.log(`ID: ${j.id} | No: ${j.entryNumber} | Ref: ${j.referenceNumber} | Memo: ${j.memo}`));
}

check().catch(console.error).finally(() => process.exit(0));
