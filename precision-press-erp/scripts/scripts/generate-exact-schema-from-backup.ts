import fs from "node:fs";
import path from "node:path";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const backupPath = path.join(drizzleDir, "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

// Find all SET or RESET statements in backupSql
const setMatches = backupSql.match(/SET\s+[^;]+;|RESET\s+[^;]+;/gi) || [];
console.log("Found SET/RESET statements in backup:", setMatches);

// Extract all INSERT INTO statements and their target tables and columns
const insertRegex = /INSERT INTO\s+(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?\s*\(([^)]+)\)/gi;

interface TableInsertInfo {
  schema: string;
  table: string;
  columns: string[];
}

const tableColumnsMap = new Map<string, Set<string>>();
let match: RegExpExecArray | null;

while ((match = insertRegex.exec(backupSql)) !== null) {
  const schema = match[1] || "public";
  const table = match[2];
  const rawCols = match[3];
  const cols = rawCols.split(",").map(c => c.trim().replace(/^"|"$/g, ""));

  const key = `${schema}.${table}`;
  if (!tableColumnsMap.has(key)) {
    tableColumnsMap.set(key, new Set());
  }
  const set = tableColumnsMap.get(key)!;
  for (const col of cols) {
    set.add(col);
  }
}

console.log(`\nFound ${tableColumnsMap.size} tables with INSERT statements in backupSql:`);
for (const [table, cols] of tableColumnsMap.entries()) {
  console.log(`- ${table} (${cols.size} columns): ${Array.from(cols).join(", ")}`);
}
