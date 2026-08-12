const fs = require('fs');
const targetTables = new Set(['categories', 'products', 'product_track', 'workflow_departments', 'workflow_stage_history', 'document_jobs', 'stats', 'staff_users', 'role_history', 'activity_logs', 'quotations', 'dispatch_details', 'audit_logs', 'audit_stats', 'tax_templates', 'profiles', 'rate_limits', 'u_users', 'workflow_department_settings', 'orders', 'order_items', 'contact', 'hsn_master']);
const content = fs.readFileSync('precision-press-erp/drizzle/self_hosted_full_init.sql', 'utf8');

const creates = [];
for (const table of targetTables) {
  const regex = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:\\"public\\"\\.)?\\"?${table}\\"? \\([\\s\\S]*?\\n\\);`, 'gm');
  const matches = content.match(regex);
  if (matches) {
    creates.push(matches[matches.length - 1]);
  } else {
    console.log('Missing: ' + table);
  }
}
fs.writeFileSync('exact_schema_creates.sql', creates.join('\n\n'));
console.log('Extracted ' + creates.length + ' tables');
