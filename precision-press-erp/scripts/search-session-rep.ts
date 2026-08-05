import fs from "node:fs";
import path from "node:path";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const files = fs.readdirSync(drizzleDir).filter(f => f.endsWith(".sql"));

for (const file of files) {
  const content = fs.readFileSync(path.join(drizzleDir, file), "utf8");
  const matches = content.matchAll(/session_replication_role/gi);
  for (const m of matches) {
    console.log(`Found session_replication_role in ${file}`);
  }
}
