import fs from "node:fs";
import path from "node:path";

const erpDumpPath = path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql");
if (fs.existsSync(erpDumpPath)) {
  const content = fs.readFileSync(erpDumpPath, "utf8");
  const lines = content.split("\n").filter(l => l.includes("role_history"));
  console.log(`Found ${lines.length} role_history lines in ERP DDL:`);
  lines.slice(0, 5).forEach(l => console.log(l));
}
