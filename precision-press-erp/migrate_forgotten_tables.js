const fs = require('fs');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const oldDb = createClient('http://40.81.236.61', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q');
const newDb = createClient('https://eeqqiylszgrbkfcdrftv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlcXFpeWxzemdyYmtmY2RyZnR2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDkxMDQzNywiZXhwIjoyMTAwNDg2NDM3fQ.epNVP239y4dE9MODCzWqDyQ5bYcqjyyRFmmtDN0oJtc');
const newDbUrl = 'postgresql://postgres.eeqqiylszgrbkfcdrftv:Powerstar%40200319@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';

const tables = ['orders', 'order_items', 'profiles', 'transactions', 'journal_entries', 'accounts_ledger', 'tax_templates', 'hsn_master', 'suppliers', 'invoice_sequences', 'credit_notes', 'credit_note_items', 'company_cash_ledger', 'company_bank_ledger', 'hand_cash_ledger', 'bank_amount_ledger', 'company_full_details', 'bank_accounts', 'invoice_generation_attempts', 'invoice_events'];

async function run() {
  const pgClient = new Client({ connectionString: newDbUrl });
  await pgClient.connect();

  console.log('--- 1. Creating missing schemas ---');
  const initSql = fs.readFileSync('supabase/migrations/00000_init.sql', 'utf-8');
  const additionalSql = fs.readFileSync('supabase/migrations/20260719051835_add_credit_notes_and_inventory.sql', 'utf-8');
  const combinedSql = initSql + '\n\n' + additionalSql;
  
  for (const table of tables) {
     const regexStr1 = `CREATE TABLE IF NOT EXISTS "public"."${table}"[\\s\\S]*?\\);`;
     const regexStr2 = `CREATE TABLE public\\.${table}[\\s\\S]*?\\);`;
     let match = new RegExp(regexStr1, 'g').exec(combinedSql) || new RegExp(regexStr2, 'g').exec(combinedSql);
     
     if (match) {
         let schemaStr = match[0];
         schemaStr = schemaStr.replace(/"id" "text" NOT NULL,/g, '"id" "text" PRIMARY KEY NOT NULL,');
         try {
           await pgClient.query(schemaStr);
           console.log(`✅ Created schema for ${table}`);
         } catch(e) {
           console.log(`⚠️ Schema for ${table} might exist: ${e.message}`);
         }
     } else {
         console.log(`⚠️ Could not find schema for ${table} in migration files.`);
     }
  }

  // Reload schema cache
  await pgClient.query("NOTIFY pgrst, 'reload schema';");

  console.log('\n--- 2. Migrating Data ---');
  for (const table of tables) {
    console.log('Fetching', table, '...');
    try {
        let allRows = [];
        let rangeStart = 0, rangeEnd = 999;
        
        while (true) {
            const { data, error } = await oldDb.from(table).select('*').range(rangeStart, rangeEnd);
            if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
            if (data && data.length > 0) { allRows = allRows.concat(data); rangeStart += 1000; rangeEnd += 1000; }
            if (!data || data.length < 1000) break;
        }

        if (allRows.length > 0) {
            console.log(`Inserting ${allRows.length} rows into ${table}...`);
            let insertedCount = 0;
            for(let i=0; i<allRows.length; i+=500) {
                const chunk = allRows.slice(i, i+500);
                const { error: insertError } = await newDb.from(table).insert(chunk);
                if (insertError) {
                    console.error('Insert error for', table, ':', insertError.message);
                } else {
                    insertedCount += chunk.length;
                }
            }
            console.log(`✅ Successfully inserted ${insertedCount}/${allRows.length} rows for ${table}`);
        } else {
            console.log(`No data found for ${table}`);
        }
    } catch(e) {
        console.error(`Fatal error migrating ${table}: ${e.message}`);
    }
  }
  await pgClient.end();
}
run();
