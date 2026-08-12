const fs = require('fs');
const path = require('path');

const targetTables = ['categories', 'products', 'product_track', 'workflow_departments', 'workflow_stage_history', 'document_jobs', 'stats', 'staff_users', 'role_history', 'activity_logs', 'quotations', 'dispatch_details', 'audit_logs', 'audit_stats', 'tax_templates', 'profiles', 'rate_limits', 'u_users', 'workflow_department_settings', 'orders', 'order_items', 'contact', 'hsn_master'];

const drizzleDir = 'precision-press-erp/drizzle';
const files = fs.readdirSync(drizzleDir).filter(f => f.endsWith('.sql') && !f.includes('backup'));

let allSql = '';
for (const f of files) {
  allSql += fs.readFileSync(path.join(drizzleDir, f), 'utf8') + '\n';
}

const output = [];

for (const table of targetTables) {
  output.push(`-- === FULL SCHEMA FOR ${table} ===`);
  
  // Extract CREATE TABLE
  const createRegex = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:\\"public\\"\\.)?\\"?${table}\\"? \\([\\s\\S]*?\\n\\);`, 'gm');
  const createMatches = allSql.match(createRegex);
  if (createMatches) {
    let createStmt = createMatches[createMatches.length - 1];
    // Ensure IF NOT EXISTS
    createStmt = createStmt.replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ');
    createStmt = createStmt.replace(/IF NOT EXISTS IF NOT EXISTS /g, 'IF NOT EXISTS ');
    // Remove NOT NULL to be safe with data
    createStmt = createStmt.replace(/ NOT NULL/g, '');
    output.push(createStmt);
  } else {
    output.push(`-- WARNING: CREATE TABLE NOT FOUND FOR ${table}`);
  }
  
  // Extract ALTER TABLE
  const lines = allSql.split('\n');
  for (const line of lines) {
    if (line.includes(`ALTER TABLE "public"."${table}"`) || line.includes(`ALTER TABLE public.${table} `) || line.includes(`ALTER TABLE "${table}" `)) {
      let alterStmt = line;
      
      
      if (alterStmt.includes('ADD CONSTRAINT')) continue;
      alterStmt = alterStmt.replace(/ADD COLUMN /g, 'ADD COLUMN IF NOT EXISTS ');
      alterStmt = alterStmt.replace(/IF NOT EXISTS IF NOT EXISTS/g, 'IF NOT EXISTS');
      alterStmt = alterStmt.replace(/--> statement-breakpoint;/g, '');
      if (!alterStmt.endsWith(';')) alterStmt += ';';

      output.push(alterStmt);
    }
  }
  
  output.push('');
}

// Now extract the fixed INSERT statements from restore_tables_idempotent.sql (which has the NOW() fix)
output.push(`-- === DATA INSERTS ===`);
const insertsSql = fs.readFileSync('restore_tables_idempotent.sql', 'utf8');
const insertLines = insertsSql.split('\n');
for (const line of insertLines) {
  if (line.startsWith('INSERT INTO')) {
    output.push(line);
  }
}

fs.writeFileSync('restore_tables_perfect.sql', output.join('\n'));
console.log('Created restore_tables_perfect.sql');
