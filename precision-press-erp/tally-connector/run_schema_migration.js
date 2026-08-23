'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { Client } = require('pg');

async function runMigration() {
  const configs = [
    { host: '40.81.236.61', port: 5432, user: 'postgres', password: 'your-super-secret-and-long-postgres-password', database: 'postgres' },
    { host: '40.81.236.61', port: 5433, user: 'postgres', password: 'your-super-secret-and-long-postgres-password', database: 'postgres' },
    { host: 'localhost', port: 5433, user: 'postgres', password: 'your-super-secret-and-long-postgres-password', database: 'postgres' },
    { host: 'localhost', port: 5432, user: 'postgres', password: 'your-super-secret-and-long-postgres-password', database: 'postgres' }
  ];

  for (const cfg of configs) {
    try {
      console.log(`Trying Postgres connection to ${cfg.host}:${cfg.port}...`);
      const client = new Client({ ...cfg, connectionTimeoutMillis: 3000 });
      await client.connect();
      console.log(`✅ Connected successfully to ${cfg.host}:${cfg.port}!`);

      const sql = `
        ALTER TABLE public.chart_account 
        ADD COLUMN IF NOT EXISTS tally_ledger_name TEXT,
        ADD COLUMN IF NOT EXISTS tally_guid TEXT,
        ADD COLUMN IF NOT EXISTS alter_id BIGINT,
        ADD COLUMN IF NOT EXISTS tally_parent_group TEXT,
        ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0,
        ADD COLUMN IF NOT EXISTS opening_balance_type TEXT DEFAULT 'Dr';

        ALTER TABLE public.bank_account 
        ADD COLUMN IF NOT EXISTS tally_ledger_name TEXT,
        ADD COLUMN IF NOT EXISTS tally_guid TEXT,
        ADD COLUMN IF NOT EXISTS alter_id BIGINT,
        ADD COLUMN IF NOT EXISTS ifsc_code TEXT,
        ADD COLUMN IF NOT EXISTS branch_name TEXT;
      `;

      await client.query(sql);
      console.log('🎉 SUCCESS: Columns added to chart_account and bank_account!');
      await client.end();
      return true;
    } catch (err) {
      console.log(`  ❌ Failed on ${cfg.host}:${cfg.port}: ${err.message}`);
    }
  }

  console.log('Direct PG port unreachable from local machine.');
  return false;
}

runMigration().then(success => {
  process.exit(success ? 0 : 1);
});
