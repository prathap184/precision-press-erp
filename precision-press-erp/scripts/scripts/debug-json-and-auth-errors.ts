import fs from "node:fs";
import path from "node:path";

const initPath = path.resolve(process.cwd(), "drizzle", "self_hosted_full_init.sql");
const initSql = fs.readFileSync(initPath, "utf8");

const lines = initSql.split("\n");

console.log("=== 1. Checking lines with product-6809 or currentStepIndex ===");
lines.filter(l => l.includes("product-6809") || l.includes("currentStepIndex")).slice(0, 5).forEach(l => console.log(l));

console.log("\n=== 2. Checking auth.users inserts in self_hosted_full_init.sql ===");
lines.filter(l => l.includes('INSERT INTO "auth"."users"') || l.includes('INSERT INTO auth.users')).slice(0, 5).forEach(l => console.log(l));
