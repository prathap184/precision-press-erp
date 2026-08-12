const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'http://40.81.236.61';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const PUBLIC_TABLES = [
  'categories', 'products', 'workflow_departments', 'workflow_stage_history',
  'document_jobs', 'stats', 'staff_users', 'role_history', 'activity_logs',
  'quotations', 'dispatch_details', 'audit_logs', 'audit_stats', 'tax_templates',
  'profiles', 'rate_limits', 'u_users', 'workflow_department_settings',
  'orders', 'order_items', 'contact', 'hsn_master'
];

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function rowsToInserts(table, rows, schema = 'public') {
  if (!rows || rows.length === 0) return `-- ${schema}.${table}: 0 rows\n`;
  const columns = Object.keys(rows[0]);
  const lines = [`-- ${schema}.${table}: ${rows.length} rows`];
  for (const row of rows) {
    const cols = columns.map(c => `"${c}"`).join(', ');
    const vals = columns.map(c => escapeValue(row[c])).join(', ');
    lines.push(`INSERT INTO "${schema}"."${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
  }
  return lines.join('\n') + '\n';
}

async function fetchAllRows(table) {
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) { console.log(`  ⚠ ${table}: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

async function backupAuthUsers() {
  console.log('Backing up: auth.users...');
  let allUsers = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.log(`  ⚠ auth.users: ${error.message}`); break; }
    if (!data || !data.users || data.users.length === 0) break;
    allUsers = allUsers.concat(data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`  ${allUsers.length} auth users`);
  return allUsers;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFile = `C:\\Users\\jprat\\OneDrive\\Videos\\full_backup_${timestamp}.sql`;

  console.log('=== FULL DATABASE BACKUP ===\n');
  let output = `-- ====================================\n`;
  output += `-- FULL DATABASE BACKUP\n`;
  output += `-- Generated: ${new Date().toISOString()}\n`;
  output += `-- Server: ${SUPABASE_URL}\n`;
  output += `-- ====================================\n\n`;

  // --- AUTH USERS ---
  output += `-- ====================================\n-- AUTH SCHEMA\n-- ====================================\n\n`;
  const authUsers = await backupAuthUsers();
  if (authUsers.length > 0) {
    for (const user of authUsers) {
      const safeUser = {
        id: user.id,
        email: user.email,
        phone: user.phone || null,
        created_at: user.created_at,
        email_confirmed_at: user.email_confirmed_at || null,
        last_sign_in_at: user.last_sign_in_at || null,
        raw_app_meta_data: user.app_metadata || {},
        raw_user_meta_data: user.user_metadata || {},
        role: user.role || 'authenticated',
        updated_at: user.updated_at || user.created_at,
        encrypted_password: user.encrypted_password || '',
        aud: 'authenticated',
        confirmation_token: '',
        email_change: '',
        email_change_token_new: '',
        recovery_token: ''
      };
      const cols = Object.keys(safeUser).map(c => `"${c}"`).join(', ');
      const vals = Object.values(safeUser).map(v => escapeValue(v)).join(', ');
      output += `INSERT INTO "auth"."users" (${cols}) VALUES (${vals}) ON CONFLICT (id) DO NOTHING;\n`;
    }
  }
  output += '\n';

  // --- PUBLIC TABLES ---
  output += `-- ====================================\n-- PUBLIC SCHEMA\n-- ====================================\n\n`;
  let totalRows = 0;
  for (const table of PUBLIC_TABLES) {
    process.stdout.write(`Backing up: ${table}... `);
    const rows = await fetchAllRows(table);
    console.log(`${rows.length} rows`);
    totalRows += rows.length;
    output += rowsToInserts(table, rows, 'public');
    output += '\n';
  }

  fs.writeFileSync(outputFile, output, 'utf8');
  const sizeMB = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2);
  
  console.log(`\n=============================`);
  console.log(`✅ BACKUP COMPLETE!`);
  console.log(`   File: ${outputFile}`);
  console.log(`   Size: ${sizeMB} MB`);
  console.log(`   Auth Users: ${authUsers.length}`);
  console.log(`   Public rows: ${totalRows}`);
  console.log(`=============================`);
}

main().catch(console.error);
