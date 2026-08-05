import fs from "node:fs";
import path from "node:path";

const initPath = path.resolve(process.cwd(), "drizzle", "self_hosted_full_init.sql");
const initSql = fs.readFileSync(initPath, "utf8");
const lines = initSql.split("\n");

const authUsersLines = lines.filter(l => l.includes('INSERT INTO "auth"."users"') || l.includes('INSERT INTO auth.users'));
console.log("Count of auth.users inserts:", authUsersLines.length);
if (authUsersLines.length > 0) {
  console.log("First line:", authUsersLines[0]);
}
