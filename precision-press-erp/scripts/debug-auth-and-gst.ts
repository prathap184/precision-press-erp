import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const sql = fs.readFileSync(backupPath, "utf8");

// 1. Inspect auth.users columns
const authLines = sql.split("\n").filter(l => l.includes('INSERT INTO "auth"."users"'));
console.log(`Found ${authLines.length} auth.users insert lines. Sample:`);
if (authLines.length > 0) {
  console.log(authLines[0].substring(0, 300));
}

// 2. Search for the insert statement containing '{"gst":21.6'
const gstLines = sql.split("\n").filter(l => l.includes('{"gst":21.6'));
console.log(`\nFound ${gstLines.length} lines with '{"gst":21.6'. Sample header:`);
if (gstLines.length > 0) {
  const match = gstLines[0].match(/INSERT INTO\s+([^\(]+)\(([^)]+)\)/i);
  if (match) {
    console.log("Table:", match[1].trim());
    console.log("Columns:", match[2].trim());
  }
  console.log("Line snippet:", gstLines[0].substring(0, 400));
}
