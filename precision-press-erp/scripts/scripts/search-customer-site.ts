import fs from "node:fs";
import path from "node:path";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const backupPath = path.join(drizzleDir, "supabase_full_backup.sql");
const erpDumpPath = path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql");

function searchFile(filePath: string, searchStr: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchStr)) {
      console.log(`Found in ${path.basename(filePath)} line ${i+1}:`);
      console.log(lines[i].substring(0, 300));
    }
  }
}

searchFile(backupPath, "Final delivery to customer site");
searchFile(erpDumpPath, "Final delivery to customer site");
