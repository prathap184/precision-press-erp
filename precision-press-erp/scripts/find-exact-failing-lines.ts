import fs from "node:fs";
import path from "node:path";

const initPath = path.resolve(process.cwd(), "drizzle", "self_hosted_full_init.sql");
const initSql = fs.readFileSync(initPath, "utf8");
const lines = initSql.split("\n");

console.log("=== 1. Finding ALL auth.users inserts ===");
const authUsersLines = lines.filter(l => l.includes('auth"."users') || l.includes('auth.users'));
console.log(`Total auth.users lines: ${authUsersLines.length}`);
authUsersLines.forEach((l, idx) => {
  const hasEmailCol = l.includes('"email"') || l.includes(' email,') || l.includes(' email ');
  console.log(`Line ${idx + 1}: hasEmailCol = ${hasEmailCol}`);
  if (hasEmailCol) {
    console.log("  FULL LINE:", l.slice(0, 200) + "...");
  }
});

console.log("\n=== 2. Finding invalid input syntax for type json lines ===");
lines.forEach((l, idx) => {
  if (l.includes("Delivery") || l.includes("Printing") || l.includes("Step 1")) {
    console.log(`Line ${idx + 1}:`, l);
  }
});
