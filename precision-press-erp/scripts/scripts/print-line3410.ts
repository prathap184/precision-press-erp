import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const line3410 = backupSql.split("\n")[3409]; // 0-indexed
console.log("Line 3410 content:");
console.log(line3410);
