import fs from "node:fs";
import path from "node:path";

const erpSqlPath = path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql");
const erpSql = fs.readFileSync(erpSqlPath, "utf8");

// Find all column definitions in database_migration_dump_fixed.sql with jsonb type
const jsonbCols = erpSql.match(/"[a-zA-Z0-9_]+"\s+"jsonb"/g) || [];
console.log(`Found ${jsonbCols.length} jsonb columns in ERP dump:`);
console.log(Array.from(new Set(jsonbCols)));
