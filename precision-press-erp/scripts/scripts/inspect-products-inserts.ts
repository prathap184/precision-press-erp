import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const productLines = backupSql.split("\n").filter(l => l.includes('INSERT INTO "public"."products"'));
console.log(`Found ${productLines.length} product insert lines:`);
if (productLines.length > 0) {
  console.log("Line 1:", productLines[0]);
}
