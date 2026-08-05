import fs from "node:fs";
import path from "node:path";

const initPath = path.resolve(process.cwd(), "drizzle", "self_hosted_full_init.sql");
const initSql = fs.readFileSync(initPath, "utf8");
const lines = initSql.split("\n");

console.log("=== 1. Checking ALL DDL statements for orders ===");
lines.filter(l => l.toLowerCase().includes("table") && l.toLowerCase().includes("orders")).forEach(l => console.log(l));

console.log("\n=== 2. Checking ALL DDL statements for auth.users or users ===");
lines.filter(l => l.toLowerCase().includes("table") && l.toLowerCase().includes("users")).forEach(l => console.log(l));
