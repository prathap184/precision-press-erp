import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const lines = backupSql.split("\n");

console.log("--- Searching for JSON in numeric total column ---");
for (const line of lines) {
  if (line.includes('{"gst":21.6') || line.includes("amount_in_words") || line.includes('INSERT INTO "auth"."users"') || line.includes('INSERT INTO "public"."users"')) {
    console.log(line.substring(0, 180));
  }
}
