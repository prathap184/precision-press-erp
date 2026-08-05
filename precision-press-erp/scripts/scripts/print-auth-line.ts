import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const sql = fs.readFileSync(backupPath, "utf8");
const authLines = sql.split("\n").filter(l => l.includes('INSERT INTO "auth"."users"') || l.includes('INSERT INTO auth.users'));

if (authLines.length > 0) {
  console.log("LINE:", authLines[0]);
}
