import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const orgLines = backupSql.split("\n").filter(l => l.includes("INSERT INTO") && l.includes("organization"));
console.log(`Found ${orgLines.length} organization insert lines:`);
for (const line of orgLines) {
  console.log(line);
}
