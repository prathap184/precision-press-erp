const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const oldSupabaseUrl = 'http://40.81.236.61';
const oldServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const supabase = createClient(oldSupabaseUrl, oldServiceRoleKey);

const tables = [
  'products',
  'categories',
  'product_track',
  'jobs',
  'workflow',
  'workflow_departments',
  'workflow_stage_history',
  'dispatches',
  'anomalies',
  'document_jobs',
  'design_revisions',
  'design_proofs',
  'backup_designs',
  'notifications_log',
  'stats',
  'staff_users',
  'role_history'
];

async function generateDump() {
  let sqlDump = '-- MIGRATION DUMP (SCHEMA + DATA)\n\n';

  // 1. EXTRACT SCHEMA FROM INIT.SQL
  try {
    const initSql = fs.readFileSync('supabase/migrations/00000_init.sql', 'utf-8');
    const additionalSql = fs.readFileSync('supabase/migrations/20260719051835_add_credit_notes_and_inventory.sql', 'utf-8');
    const combinedSql = initSql + '\n\n' + additionalSql;
    
    // Simple extraction of CREATE TABLE blocks
    for (const table of tables) {
       // A bit naive, but we find 'CREATE TABLE public.table_name' and read until ');'
       const regexStr1 = `CREATE TABLE IF NOT EXISTS "public"."${table}"[\\s\\S]*?\\);`;
       const regexStr2 = `CREATE TABLE public\\.${table}[\\s\\S]*?\\);`;
       const match1 = new RegExp(regexStr1, 'g').exec(combinedSql);
       const match2 = new RegExp(regexStr2, 'g').exec(combinedSql);
       
       if (match1) {
           sqlDump += match1[0] + '\n\n';
       } else if (match2) {
           sqlDump += match2[0] + '\n\n';
       } else {
           // Maybe it's missing in SQL files but we need it. 
           // Staff users was already created, but we can just skip schema if not found.
           console.log(`Schema for ${table} not found in migrations.`);
       }
    }
  } catch(e) {
    console.error('Could not parse SQL files:', e);
  }

  // 2. FETCH DATA AND GENERATE INSERTS
  for (const table of tables) {
    console.log(`Fetching data for ${table}...`);
    try {
      // Fetch all rows
      let allRows = [];
      let lastId = 0;
      let rangeStart = 0;
      let rangeEnd = 999;
      
      while (true) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(rangeStart, rangeEnd);
          
        if (error) {
          console.error(`Error fetching ${table}:`, error.message);
          break;
        }
        
        if (data && data.length > 0) {
          allRows = allRows.concat(data);
          rangeStart += 1000;
          rangeEnd += 1000;
        }
        
        if (!data || data.length < 1000) {
          break; // reached end
        }
      }

      if (allRows.length > 0) {
        sqlDump += `-- INSERT DATA FOR ${table}\n`;
        const columns = Object.keys(allRows[0]);
        
        for (const row of allRows) {
          const cols = columns.map(c => `"${c}"`).join(', ');
          const vals = columns.map(c => {
            const val = row[c];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number') return val;
            if (typeof val === 'boolean') return val;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
            return `'${String(val).replace(/'/g, "''")}'`;
          }).join(', ');
          
          sqlDump += `INSERT INTO public.${table} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        sqlDump += '\n';
        console.log(`Prepared ${allRows.length} rows for ${table}`);
      }
    } catch (e) {
      console.error(`Error processing ${table}:`, e);
    }
  }

  fs.writeFileSync('database_migration_dump.sql', sqlDump);
  console.log('Successfully generated database_migration_dump.sql');
}

generateDump();
