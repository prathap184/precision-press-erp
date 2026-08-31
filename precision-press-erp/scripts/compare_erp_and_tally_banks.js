// scripts/compare_erp_and_tally_banks.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function compare() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });

  const { rows: erpBanks } = await pool.query(`
    SELECT id, account_name, account_number, bank_name, currency_code, current_balance, is_active 
    FROM bank_account 
    WHERE deleted_at IS NULL
    ORDER BY account_name;
  `);

  const { rows: erpChartAccounts } = await pool.query(`
    SELECT id, code, name, type, sub_type, is_active
    FROM chart_account
    WHERE (type = 'asset' AND (sub_type ILIKE '%bank%' OR sub_type ILIKE '%cash%' OR name ILIKE '%bank%' OR name ILIKE '%cash%'))
      AND deleted_at IS NULL
    ORDER BY name;
  `);

  console.log('=== 🏦 ERP BANK_ACCOUNT TABLE ===');
  console.table(erpBanks.map(b => ({
    ID: b.id,
    Name: b.account_name,
    Number: b.account_number,
    Bank: b.bank_name,
    Balance: b.current_balance,
    Active: b.is_active
  })));

  console.log('\n=== 📊 ERP CHART OF ACCOUNTS (Bank / Cash) ===');
  console.table(erpChartAccounts.map(c => ({
    Code: c.code,
    Name: c.name,
    Type: c.type,
    SubType: c.sub_type,
    Active: c.is_active
  })));

  await pool.end();
}

compare().catch(console.error);
