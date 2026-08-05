import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const missingTables = [
  'activity_logs',
  'audit_logs',
  'audit_stats',
  'dispatch_details',
  'order_items',
  'orders',
  'profiles',
  'quotations',
  'rate_limits',
  'tax_templates',
  'u_users',
  'workflow_department_settings'
];

for (const table of missingTables) {
  const regex = new RegExp(`INSERT INTO "public"\\."${table}"\\s*\\(([^)]+)\\)`, "i");
  const match = backupSql.match(regex);
  if (match) {
    console.log(`\nTable ${table}:`);
    console.log(`  Columns: ${match[1]}`);
  } else {
    console.log(`\nTable ${table}: No INSERT match found`);
  }
}
