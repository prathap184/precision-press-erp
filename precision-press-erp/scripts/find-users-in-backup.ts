import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const lines = backupSql.split("\n");
console.log(`Total lines in backup: ${lines.length}`);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('users"') || lines[i].includes("auth.")) {
    console.log(`Line ${i+1}: ${lines[i].substring(0, 150)}`);
  }
}
