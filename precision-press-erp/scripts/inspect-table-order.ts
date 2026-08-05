import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const insertRegex = /INSERT INTO\s+(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi;
const tableOrder: string[] = [];
const seenTables = new Set<string>();

let m: RegExpExecArray | null;
while ((m = insertRegex.exec(backupSql)) !== null) {
  const schema = m[1] || "public";
  const table = m[2];
  const name = `${schema}.${table}`;
  if (!seenTables.has(name)) {
    seenTables.add(name);
    tableOrder.push(name);
  }
}

console.log(`Order of tables in backupSql (${tableOrder.length} tables):`);
tableOrder.forEach((t, i) => console.log(`${i + 1}. ${t}`));
