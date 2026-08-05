import fs from "node:fs";
import path from "node:path";

const erpDumpPath1 = path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql");
const erpDumpPath2 = path.resolve(process.cwd(), "..", "hindustan-erp", "precision-press-erp", "database_migration_dump_fixed.sql");

let erpPath = "";
if (fs.existsSync(erpDumpPath1)) erpPath = erpDumpPath1;
else if (fs.existsSync(erpDumpPath2)) erpPath = erpDumpPath2;

if (erpPath) {
  const content = fs.readFileSync(erpPath, "utf8");
  const matches = content.match(/"[a-zA-Z0-9_]+"\s+"jsonb"/gi) || [];
  console.log(`Found ${matches.length} jsonb columns in ERP DDL:`);
  console.log(Array.from(new Set(matches.map(m => m.toLowerCase()))));
}
