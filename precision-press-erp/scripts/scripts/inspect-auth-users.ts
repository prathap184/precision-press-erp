import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const authUsersLines = backupSql.split("\n").filter(line => line.includes("INSERT INTO") && line.includes("auth.users"));
console.log(`Found ${authUsersLines.length} INSERT lines for auth.users:`);
for (const line of authUsersLines) {
  console.log(line.substring(0, 200) + "...");
}
