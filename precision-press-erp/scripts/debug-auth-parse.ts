import fs from "node:fs";
import path from "node:path";

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const lines = backupSql.split("\n");
const authUserLine = lines.find(l => l.includes('INSERT INTO "auth"."users"') || l.includes('INSERT INTO auth.users'));

console.log("Original line:", authUserLine);

if (authUserLine) {
  const match = authUserLine.match(/INSERT INTO\s+(?:"auth"|auth)\."users"\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)(\s+ON CONFLICT[^;]+)?;?$/i);
  if (match) {
    const rawCols = match[1].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const valStr = match[2];
    console.log("rawCols count:", rawCols.length);
    console.log("rawCols includes email?", rawCols.includes("email"));
    
    // Parse values tuple
    const tokens: string[] = [];
    let current = "";
    let inString = false;
    let quoteChar = "";

    for (let i = 0; i < valStr.length; i++) {
      const char = valStr[i];
      if (inString) {
        current += char;
        if (char === quoteChar) {
          if (i + 1 < valStr.length && valStr[i + 1] === quoteChar) {
            current += valStr[i + 1];
            i++;
          } else {
            inString = false;
          }
        }
      } else {
        if (char === "'" || char === '"') {
          inString = true;
          quoteChar = char;
          current += char;
        } else if (char === ",") {
          tokens.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }
    if (current.trim()) tokens.push(current.trim());

    console.log("valTokens count:", tokens.length);
    const emailIdx = rawCols.indexOf("email");
    console.log("email index:", emailIdx);
    console.log("email valToken:", tokens[emailIdx]);
  }
}
