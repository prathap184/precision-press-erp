const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'http://40.81.236.61',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
);

const tables = [
  'categories', 'products', 'product_track', 'workflow_departments',
  'workflow_stage_history', 'document_jobs', 'stats', 'staff_users',
  'role_history', 'activity_logs', 'quotations', 'dispatch_details',
  'audit_logs', 'audit_stats', 'tax_templates', 'profiles',
  'rate_limits', 'u_users', 'workflow_department_settings',
  'orders', 'order_items', 'contact', 'hsn_master'
];

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return val;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function backupTable(table) {
  console.log(`Backing up: ${table}...`);
  let allRows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);

    if (error) {
      console.log(`  WARNING: ${table} - ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (allRows.length === 0) {
    console.log(`  No data in ${table}`);
    return `-- Table: ${table} (0 rows)\n`;
  }

  console.log(`  ${allRows.length} rows`);
  const columns = Object.keys(allRows[0]);
  const lines = [`-- Table: ${table} (${allRows.length} rows)`];

  for (const row of allRows) {
    const vals = columns.map(c => escapeValue(row[c])).join(', ');
    const cols = columns.map(c => `"${c}"`).join(', ');
    lines.push(`INSERT INTO "public"."${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
  }

  return lines.join('\n') + '\n';
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFile = `C:\\Users\\jprat\\OneDrive\\Desktop\\Hindustan Enterprices\\api_backup_${timestamp}.sql`;
  
  console.log('Starting API backup...\n');
  let output = `-- Full API Backup\n-- Generated: ${new Date().toISOString()}\n\n`;

  for (const table of tables) {
    output += await backupTable(table);
    output += '\n';
  }

  fs.writeFileSync(outputFile, output);
  console.log(`\n✅ Backup saved to: ${outputFile}`);
  console.log(`   File size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
