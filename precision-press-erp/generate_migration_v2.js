const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const oldSupabaseUrl = 'http://40.81.236.61';
const oldServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const supabase = createClient(oldSupabaseUrl, oldServiceRoleKey);

const tables = [
  'products', 'categories', 'product_track', 'jobs', 'workflow',
  'workflow_departments', 'workflow_stage_history', 'dispatches',
  'anomalies', 'document_jobs', 'design_revisions', 'design_proofs',
  'backup_designs', 'notifications_log', 'stats', 'staff_users', 'role_history'
];

async function generateDump() {
  let sqlDump = '-- MIGRATION DUMP (SCHEMA + DATA)\n\n';

  try {
    const initSql = fs.readFileSync('supabase/migrations/00000_init.sql', 'utf-8');
    const additionalSql = fs.readFileSync('supabase/migrations/20260719051835_add_credit_notes_and_inventory.sql', 'utf-8');
    const combinedSql = initSql + '\n\n' + additionalSql;
    
    for (const table of tables) {
       const regexStr1 = `CREATE TABLE IF NOT EXISTS "public"."${table}"[\\s\\S]*?\\);`;
       const regexStr2 = `CREATE TABLE public\\.${table}[\\s\\S]*?\\);`;
       const match1 = new RegExp(regexStr1, 'g').exec(combinedSql);
       const match2 = new RegExp(regexStr2, 'g').exec(combinedSql);
       
       let schemaStr = '';
       if (match1) schemaStr = match1[0];
       else if (match2) schemaStr = match2[0];
       
       if (schemaStr) {
           schemaStr = schemaStr.replace(/"id" "text" NOT NULL,/g, '"id" "text" PRIMARY KEY NOT NULL,\n    "current_stock" numeric(12,2) DEFAULT 0,');
           sqlDump += schemaStr + '\n\n';
       }
    }
  } catch(e) {
    console.error('Could not parse SQL files:', e);
  }

  for (const table of tables) {
    console.log(`Fetching data for ${table}...`);
    try {
      let allRows = [];
      let rangeStart = 0;
      let rangeEnd = 999;
      
      while (true) {
        const { data, error } = await supabase.from(table).select('*').range(rangeStart, rangeEnd);
        if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
        if (data && data.length > 0) { allRows = allRows.concat(data); rangeStart += 1000; rangeEnd += 1000; }
        if (!data || data.length < 1000) break;
      }

      if (allRows.length > 0) {
        sqlDump += `-- INSERT DATA FOR ${table}\n`;
        const columns = Object.keys(allRows[0]);
        
        for (const row of allRows) {
          const cols = columns.map(c => `"${c}"`).join(', ');
          const vals = columns.map(c => {
            let val = row[c];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number' || typeof val === 'boolean') return val;
            
            // Format for JSONB or TEXT string
            if (typeof val === 'object') {
                return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
            } else if (typeof val === 'string') {
                // If the string starts with { or [ it MIGHT be JSONB stringified. 
                // In Supabase JS, JSON columns usually come back as objects.
                // Dates come back as strings.
                return `'${val.replace(/'/g, "''")}'`;
            }
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
