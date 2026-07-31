const fs = require('fs');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const oldSupabaseUrl = 'http://40.81.236.61';
const oldServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
const newDbUrl = 'postgresql://postgres.eeqqiylszgrbkfcdrftv:Powerstar%40200319@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';

const supabase = createClient(oldSupabaseUrl, oldServiceRoleKey);

const tables = [
  'products', 'categories', 'product_track', 'jobs', 'workflow',
  'workflow_departments', 'workflow_stage_history', 'dispatches',
  'anomalies', 'document_jobs', 'design_revisions', 'design_proofs',
  'backup_designs', 'notifications_log', 'stats', 'staff_users', 'role_history'
];

async function migrate() {
  const pgClient = new Client({ connectionString: newDbUrl });
  await pgClient.connect();

  console.log('1. Applying schemas...');
  const initSql = fs.readFileSync('supabase/migrations/00000_init.sql', 'utf-8');
  const additionalSql = fs.readFileSync('supabase/migrations/20260719051835_add_credit_notes_and_inventory.sql', 'utf-8');
  const combinedSql = initSql + '\n\n' + additionalSql;
  
  for (const table of tables) {
     const regexStr1 = `CREATE TABLE IF NOT EXISTS "public"."${table}"[\\s\\S]*?\\);`;
     const regexStr2 = `CREATE TABLE public\\.${table}[\\s\\S]*?\\);`;
     let match = new RegExp(regexStr1, 'g').exec(combinedSql) || new RegExp(regexStr2, 'g').exec(combinedSql);
     
     if (match) {
         let schemaStr = match[0];
         schemaStr = schemaStr.replace(/"id" "text" NOT NULL,/g, '"id" "text" PRIMARY KEY NOT NULL,\n    "current_stock" numeric(12,2) DEFAULT 0,');
         try {
           await pgClient.query(schemaStr);
           console.log(`Created schema for ${table}`);
         } catch(e) {
           console.log(`Schema for ${table} might already exist or error:`, e.message);
         }
     }
  }

  console.log('\n2. Transferring data...');
  for (const table of tables) {
    console.log(`Fetching data for ${table}...`);
    try {
      let allRows = [];
      let rangeStart = 0, rangeEnd = 999;
      
      while (true) {
        const { data, error } = await supabase.from(table).select('*').range(rangeStart, rangeEnd);
        if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
        if (data && data.length > 0) { allRows = allRows.concat(data); rangeStart += 1000; rangeEnd += 1000; }
        if (!data || data.length < 1000) break;
      }

      if (allRows.length > 0) {
        let inserted = 0;
        for (const row of allRows) {
          const keys = Object.keys(row);
          const values = Object.values(row);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const query = `INSERT INTO public.${table} ("${keys.join('", "')}") VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
          
          try {
            await pgClient.query(query, values);
            inserted++;
          } catch(err) {
            console.error(`Row insert failed for ${table}:`, err.message);
          }
        }
        console.log(`✅ Successfully inserted ${inserted}/${allRows.length} rows for ${table}`);
      }
    } catch (e) {
      console.error(`Error processing ${table}:`, e);
    }
  }

  await pgClient.end();
  console.log('\n🎉 Migration complete!');
}

migrate();
