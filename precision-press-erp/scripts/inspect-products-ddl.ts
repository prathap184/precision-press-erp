import fs from "node:fs";
import path from "node:path";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const baselineSql = fs.readFileSync(path.join(drizzleDir, "0000_baseline.sql"), "utf8");
const erpSql = fs.readFileSync(path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql"), "utf8");

function extractCreateTable(sql: string, tableName: string) {
  const regex = new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+"?${tableName}"?\\s*\\(([^;]+)\\);`, "i");
  const match = sql.match(regex);
  if (match) {
    console.log(`=== CREATE TABLE ${tableName} ===`);
    console.log(match[0].substring(0, 500));
  } else {
    console.log(`=== CREATE TABLE ${tableName} NOT FOUND ===`);
  }
}

console.log("0000_baseline.sql:");
extractCreateTable(baselineSql, "products");

console.log("\ndatabase_migration_dump_fixed.sql:");
extractCreateTable(erpSql, "public\\.products");
