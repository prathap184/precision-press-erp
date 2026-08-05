import fs from "node:fs";
import path from "node:path";

const initPath = path.resolve(process.cwd(), "drizzle", "self_hosted_full_init.sql");
const initSql = fs.readFileSync(initPath, "utf8");

const lines = initSql.split("\n");

console.log("=== 1. Checking role_history in self_hosted_full_init.sql ===");
lines.filter(l => l.includes("role_history") && l.includes("INSERT")).forEach(l => console.log(l));

console.log("\n=== 2. Checking auth.users inserts in self_hosted_full_init.sql ===");
lines.filter(l => l.includes("INSERT INTO") && l.includes("users")).slice(0, 3).forEach(l => console.log(l));

console.log("\n=== 3. Checking orders table definition in self_hosted_full_init.sql ===");
lines.filter(l => l.includes("CREATE TABLE") && l.includes("orders")).forEach(l => console.log(l));
lines.filter(l => l.includes("ALTER TABLE") && l.includes("orders")).slice(0, 10).forEach(l => console.log(l));
