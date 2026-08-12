const fs = require('fs');

const targetTables = ['categories', 'products', 'product_track', 'workflow_departments', 'workflow_stage_history', 'document_jobs', 'stats', 'staff_users', 'role_history', 'activity_logs', 'quotations', 'dispatch_details', 'audit_logs', 'audit_stats', 'tax_templates', 'profiles', 'rate_limits', 'u_users', 'workflow_department_settings', 'orders', 'order_items', 'contact', 'hsn_master'];

const schemaContent = fs.readFileSync('precision-press-erp/drizzle/self_hosted_full_init.sql', 'utf8');
const dataContent = fs.readFileSync('precision-press-erp/drizzle/supabase_full_backup.sql', 'utf8');

const output = [];

for (const table of targetTables) {
  // Extract schema
  const regex = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:\\"public\\"\\.)?\\"?${table}\\"? \\([\\s\\S]*?\\n\\);`, 'gm');
  const matches = schemaContent.match(regex);
  if (matches) {
    output.push(`-- SCHEMA FOR ${table}`);
    output.push(matches[matches.length - 1]);
    output.push('');
    
    // Extract data
    output.push(`-- DATA FOR ${table}`);
    const insertRegex = new RegExp(`^INSERT INTO (\\"?public\\"?\\.)?\\"?${table}\\"?\\s`, 'i');
    
    let foundData = false;
    const lines = dataContent.split('\n');
    for (const line of lines) {
      if (insertRegex.test(line)) {
        output.push(line);
        foundData = true;
      }
    }
    
    if (!foundData) {
      output.push(`-- No data found for ${table}`);
    }
    output.push('');
  } else {
    output.push(`-- ERROR: Schema not found for ${table}`);
  }
}

fs.writeFileSync('restore_tables_with_data.sql', output.join('\n'));
console.log('Successfully generated restore_tables_with_data.sql');
