import fs from "node:fs";
import path from "node:path";

function stripGeneratedColumnsFromAuthUsers(sqlLine: string): string {
  const match = sqlLine.match(/^INSERT INTO\s+(?:"auth"\.)?"users"\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)(\s*ON CONFLICT.*)?;?$/i);
  if (!match) return sqlLine;

  const colsRaw = match[1];
  const valsRaw = match[2];
  const onConflictStr = match[3] || "";

  const cols = colsRaw.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
  
  const vals: string[] = [];
  let currentVal = "";
  let inString = false;
  let quoteChar = "";

  for (let i = 0; i < valsRaw.length; i++) {
    const ch = valsRaw[i];
    if (inString) {
      currentVal += ch;
      if (ch === quoteChar) {
        if (i + 1 < valsRaw.length && valsRaw[i + 1] === quoteChar) {
          currentVal += valsRaw[i + 1];
          i++;
        } else {
          inString = false;
        }
      }
    } else {
      if (ch === "'" || ch === '"') {
        inString = true;
        quoteChar = ch;
        currentVal += ch;
      } else if (ch === ",") {
        vals.push(currentVal.trim());
        currentVal = "";
      } else {
        currentVal += ch;
      }
    }
  }
  if (currentVal.trim()) {
    vals.push(currentVal.trim());
  }

  if (cols.length !== vals.length) {
    return sqlLine;
  }

  const generatedCols = new Set(["confirmed_at", "email"]);
  const newCols: string[] = [];
  const newVals: string[] = [];

  for (let i = 0; i < cols.length; i++) {
    if (!generatedCols.has(cols[i])) {
      newCols.push(`"${cols[i]}"`);
      newVals.push(vals[i]);
    }
  }

  return `INSERT INTO "auth"."users" (${newCols.join(", ")}) OVERRIDING SYSTEM VALUE VALUES (${newVals.join(", ")})${onConflictStr};`;
}

const backupPath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
const sql = fs.readFileSync(backupPath, "utf8");
const authLines = sql.split("\n").filter(l => l.includes('INSERT INTO "auth"."users"') || l.includes('INSERT INTO auth.users'));

if (authLines.length > 0) {
  const original = authLines[0];
  const stripped = stripGeneratedColumnsFromAuthUsers(original);
  console.log("Original columns count:", original.match(/"/g)?.length);
  console.log("Does stripped contain standalone '\"email\"'?", /\b"email"\b/.test(stripped));
  console.log("Does stripped contain standalone '\"confirmed_at\"'?", /\b"confirmed_at"\b/.test(stripped));
}
