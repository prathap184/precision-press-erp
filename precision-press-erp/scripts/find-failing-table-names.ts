import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const lines = backupSql.split("\n");

console.log("--- Searching for tables with amount_in_words and gst json ---");
for (const line of lines) {
  if (line.includes('{"gst":21.6')) {
    console.log("GST JSON Line table:", line.substring(0, 100));
  }
  if (line.includes('amount_in_words')) {
    console.log("amount_in_words line table:", line.substring(0, 100));
  }
}
