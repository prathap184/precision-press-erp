import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

// Extract all table names referenced in INSERT INTO statements
const insertMatches = backupSql.matchAll(/INSERT INTO\s+(?:"public"|"auth")\."?([a-zA-Z0-9_]+)"?/gi);
const tablesInBackup = new Set<string>();
for (const match of insertMatches) {
  tablesInBackup.add(match[1]);
}

console.log(`Found ${tablesInBackup.size} tables in supabase_full_backup.sql:`);
console.log(Array.from(tablesInBackup).sort());
