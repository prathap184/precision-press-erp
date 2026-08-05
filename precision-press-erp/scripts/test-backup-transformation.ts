import fs from "node:fs";
import path from "node:path";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const backupPath = path.join(drizzleDir, "supabase_full_backup.sql");

console.log("Reading backup SQL...");
let backupSql = fs.readFileSync(backupPath, "utf8");

// Parse all tables and their columns from backupSql
const insertHeaderRegex = /INSERT INTO\s+(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?\s*\(([^)]+)\)/gi;

const tableMap = new Map<string, { schema: string; table: string; columns: Set<string> }>();

let match: RegExpExecArray | null;
while ((match = insertHeaderRegex.exec(backupSql)) !== null) {
  const schema = (match[1] || "public").toLowerCase();
  const table = match[2].toLowerCase();
  const rawCols = match[3];
  const cols = rawCols.split(",").map(c => c.trim().replace(/^"|"$/g, ""));

  const key = `${schema}.${table}`;
  if (!tableMap.has(key)) {
    tableMap.set(key, { schema, table, columns: new Set() });
  }
  const spec = tableMap.get(key)!;
  for (const c of cols) {
    spec.columns.add(c);
  }
}

console.log(`Parsed ${tableMap.size} tables with columns.`);

const lines = backupSql.split("\n");
let fixedAuthUsersCount = 0;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('INSERT INTO "auth"."users"')) {
    const line = lines[i];
    const match = line.match(/INSERT INTO "auth"\."users"\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)(\s+ON CONFLICT[^;]+)?;?$/i);
    if (match) {
      const rawColsStr = match[1];
      const rawValuesStr = match[2];
      const onConflictStr = match[3] || "";

      const cols = rawColsStr.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const confirmedIdx = cols.indexOf("confirmed_at");
      if (confirmedIdx !== -1) {
        cols.splice(confirmedIdx, 1);
        const newColsStr = cols.map(c => `"${c}"`).join(", ");

        const valTokens = parseSqlValuesTuple(rawValuesStr);
        if (valTokens.length === cols.length + 1) {
          valTokens.splice(confirmedIdx, 1);
          const newValuesStr = valTokens.join(", ");
          lines[i] = `INSERT INTO "auth"."users" (${newColsStr}) VALUES (${newValuesStr})${onConflictStr};`;
          fixedAuthUsersCount++;
        } else {
          console.warn(`Mismatch in auth.users tokens at line ${i+1}: expected ${cols.length + 1}, got ${valTokens.length}`);
        }
      }
    }
  }
}

console.log(`Fixed ${fixedAuthUsersCount} auth.users insert statements.`);
if (fixedAuthUsersCount > 0) {
  const line3410 = lines[3409];
  console.log("Transformed line 3410:");
  console.log(line3410);
}

function parseSqlValuesTuple(str: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inString = false;
  let quoteChar = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      current += char;
      if (char === quoteChar) {
        if (i + 1 < str.length && str[i + 1] === quoteChar) {
          current += str[i + 1];
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
  if (current.trim()) {
    tokens.push(current.trim());
  }
  return tokens;
}
