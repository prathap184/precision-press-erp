import fs from "node:fs";
import path from "node:path";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const erpDumpPath = path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql");

console.log("Reading ERP dump DDL...");
if (fs.existsSync(erpDumpPath)) {
  const erpSql = fs.readFileSync(erpDumpPath, "utf8");
  const createTables = erpSql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([^\s(]+)/gi) || [];
  console.log(`ERP dump creates ${createTables.length} tables:`, createTables);
} else {
  console.log("ERP dump path not found!");
}

const baselinePath = path.join(drizzleDir, "0000_baseline.sql");
if (fs.existsSync(baselinePath)) {
  const baselineSql = fs.readFileSync(baselinePath, "utf8");
  const createTables = baselineSql.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([^\s(]+)/gi) || [];
  console.log(`Drizzle 0000_baseline creates ${createTables.length} tables:`, createTables);
}
