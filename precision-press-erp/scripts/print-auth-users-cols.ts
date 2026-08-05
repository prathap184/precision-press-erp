import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const line = backupSql.split("\n").find(l => l.includes('INSERT INTO "auth"."users"'));
if (line) {
  const match = line.match(/INSERT INTO "auth"\."users"\s*\(([^)]+)\)/i);
  if (match) {
    console.log("auth.users insert columns:", match[1].split(",").map(c => c.trim()));
  }
}
