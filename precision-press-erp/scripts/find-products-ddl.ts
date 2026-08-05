import fs from "node:fs";
import path from "node:path";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const erpSqlPath = path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql");

function findCreateTable(filePath: string, name: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes("create table") && lines[i].toLowerCase().includes(name.toLowerCase())) {
      console.log(`Found in ${path.basename(filePath)} line ${i+1}:`);
      console.log(lines.slice(i, i + 15).join("\n"));
    }
  }
}

const files = fs.readdirSync(drizzleDir).filter(f => f.endsWith(".sql"));
for (const f of files) {
  findCreateTable(path.join(drizzleDir, f), "products");
}
findCreateTable(erpSqlPath, "products");
