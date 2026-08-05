import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const sql = fs.readFileSync(backupPath, "utf8");

// Inspect auth.users columns
const authLines = sql.split("\n").filter(l => l.includes('INSERT INTO "auth"."users"') || l.includes('INSERT INTO auth.users'));
console.log(`Found ${authLines.length} auth.users insert lines.`);
if (authLines.length > 0) {
  const line = authLines[0];
  const match = line.match(/INSERT INTO\s+[^\(]+\(([^)]+)\)/i);
  if (match) {
    console.log("auth.users columns:", match[1].split(",").map(c => c.trim()));
  }
}

// Inspect table with gst json object
const gstLines = sql.split("\n").filter(l => l.includes('{"gst":21.6'));
console.log(`\nFound ${gstLines.length} lines with '{"gst":21.6'.`);
if (gstLines.length > 0) {
  const line = gstLines[0];
  const match = line.match(/INSERT INTO\s+([^\(]+)\(([^)]+)\)/i);
  if (match) {
    console.log("Table name:", match[1].trim());
    console.log("Columns:", match[2].split(",").map(c => c.trim()));
  }
}
