/**
 * Database schema migration helper to verify/add Tally columns to chart_account and bank_account
 */
'use strict';

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function checkColumns() {
  console.log('Testing column access on chart_account...');
  const { data: coaData, error: coaErr } = await supabase
    .from('chart_account')
    .select('id, code, name, tally_ledger_name, tally_guid, alter_id, tally_parent_group, opening_balance, opening_balance_type')
    .limit(1);

  if (coaErr) {
    console.log('chart_account columns need to be added or checked:', coaErr.message);
  } else {
    console.log('✅ chart_account already has all required Tally mapping columns!');
  }

  console.log('Testing column access on bank_account...');
  const { data: bankData, error: bankErr } = await supabase
    .from('bank_account')
    .select('id, account_name, chart_account_id, tally_ledger_name, tally_guid, alter_id, ifsc_code, branch_name')
    .limit(1);

  if (bankErr) {
    console.log('bank_account columns need to be added or checked:', bankErr.message);
  } else {
    console.log('✅ bank_account already has all required Tally mapping columns!');
  }
}

checkColumns();
