import fs from "node:fs";
import path from "node:path";

console.log("🛠️ Rebuilding master initialization SQL script with percentage priority over logistics & auth generated column stripping...");

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const erpDumpPath1 = path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql");
const erpDumpPath2 = path.resolve(process.cwd(), "..", "hindustan-erp", "precision-press-erp", "database_migration_dump_fixed.sql");
const backupPath = path.join(drizzleDir, "supabase_full_backup.sql");

function stripGeneratedColumns(sqlLine: string, schema: string, tableName: string, generatedCols: Set<string>): string {
  // Match INSERT INTO [schema.]"table" (cols) VALUES ... handling multi-row VALUES
  const headerPattern = schema
    ? new RegExp(`^INSERT INTO\\s+(?:"?${schema}"?\\.)?"?${tableName}"?\\s*\\(([^)]+)\\)\\s*VALUES\\s*(.+?)(\\s*ON CONFLICT[^;]*)?;\\s*$`, "is")
    : new RegExp(`^INSERT INTO\\s+"?${tableName}"?\\s*\\(([^)]+)\\)\\s*VALUES\\s*(.+?)(\\s*ON CONFLICT[^;]*)?;\\s*$`, "is");

  const match = sqlLine.match(headerPattern);
  if (!match) return sqlLine;

  const colsRaw = match[1];
  const valuesBlock = match[2];
  const onConflictStr = match[3] || "";
  const cols = colsRaw.split(",").map(c => c.trim().replace(/^"|"$/g, ""));

  // Determine which indices to keep
  const keepIndices: number[] = [];
  const keepColNames: string[] = [];
  for (let i = 0; i < cols.length; i++) {
    if (!generatedCols.has(cols[i])) {
      keepIndices.push(i);
      keepColNames.push(`"${cols[i]}"`);
    }
  }
  if (keepIndices.length === cols.length) return sqlLine; // nothing to strip

  // Parse a single row's inner content (inside the parens) into values array
  function parseRowInner(inner: string): string[] {
    const vals: string[] = [];
    let cur = "";
    let inStr = false;
    let qc = "";
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (inStr) {
        cur += ch;
        if (ch === qc) {
          if (i + 1 < inner.length && inner[i + 1] === qc) { cur += inner[++i]; }
          else inStr = false;
        }
      } else if (ch === "'" || ch === '"') { inStr = true; qc = ch; cur += ch; }
      else if (ch === "(") { depth++; cur += ch; }
      else if (ch === ")") { if (depth > 0) { depth--; cur += ch; } }
      else if (ch === "," && depth === 0) { vals.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    if (cur.trim()) vals.push(cur.trim());
    return vals;
  }

  // Extract all top-level (...) groups from valuesBlock
  const rowInners: string[] = [];
  let i = 0;
  while (i < valuesBlock.length) {
    if (valuesBlock[i] === "(") {
      let depth = 0, start = i, inStr = false, qc = "";
      for (; i < valuesBlock.length; i++) {
        const ch = valuesBlock[i];
        if (inStr) {
          if (ch === qc) { if (i + 1 < valuesBlock.length && valuesBlock[i + 1] === qc) i++; else inStr = false; }
        } else if (ch === "'" || ch === '"') { inStr = true; qc = ch; }
        else if (ch === "(") depth++;
        else if (ch === ")") { depth--; if (depth === 0) { rowInners.push(valuesBlock.slice(start + 1, i)); i++; break; } }
      }
    } else { i++; }
  }

  if (rowInners.length === 0) return sqlLine;

  const filteredRows = rowInners.map(inner => {
    const vals = parseRowInner(inner);
    if (vals.length !== cols.length) return null;
    return "(" + keepIndices.map(idx => vals[idx]).join(", ") + ")";
  }).filter(Boolean);

  if (filteredRows.length === 0) return sqlLine;

  const qualifiedTable = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;
  const conflictClause = onConflictStr.trim() ? onConflictStr : " ON CONFLICT DO NOTHING";
  return `INSERT INTO ${qualifiedTable} (${keepColNames.join(", ")}) VALUES ${filteredRows.join(", ")}${conflictClause};`;
}

function stripAuthUsersGeneratedColumns(sqlLine: string): string {
  // email is NOT a generated column (confirmed via supabase_auth_admin DROP EXPRESSION test).
  // Only strip "confirmed_at" which is restricted in self-hosted Supabase.
  return stripGeneratedColumns(sqlLine, "auth", "users", new Set(["confirmed_at", "email"]));
}

let fullSql = `-- =============================================================================
-- Master Self-Hosted Supabase Full Database Initialization Script
-- =============================================================================

-- 1. Disable Foreign Key Checks for fast, clean out-of-order data restore
SET session_replication_role = 'replica';
SET CONSTRAINTS ALL DEFERRED;

DROP SCHEMA IF EXISTS "public" CASCADE;
CREATE SCHEMA "public";
GRANT ALL ON SCHEMA "public" TO postgres;
GRANT ALL ON SCHEMA "public" TO public;

CREATE SCHEMA IF NOT EXISTS "auth";
GRANT ALL ON SCHEMA "auth" TO postgres;
GRANT ALL ON SCHEMA "auth" TO public;

`;

// Step 1: Append Drizzle Migrations (0000-0007)
const migrationFiles = [
  "0000_baseline.sql",
  "0001_parity_build.sql",
  "0002_old_nightcrawler.sql",
  "0003_same_frog_thor.sql",
  "0004_faithful_paper_doll.sql",
  "0005_sleepy_albert_cleary.sql",
  "0006_normal_doctor_spectrum.sql",
  "0007_marvelous_boom_boom.sql",
];

for (const file of migrationFiles) {
  const p = path.join(drizzleDir, file);
  if (fs.existsSync(p)) {
    console.log(`Adding Drizzle migration: ${file}`);
    fullSql += `\n-- Migration: ${file}\n` + fs.readFileSync(p, "utf8") + "\n";
  }
}

// Step 2: Append ERP DDL Statements
let erpPath = "";
if (fs.existsSync(erpDumpPath1)) erpPath = erpDumpPath1;
else if (fs.existsSync(erpDumpPath2)) erpPath = erpDumpPath2;

if (erpPath) {
  console.log(`Adding ERP DDL from: ${erpPath}`);
  let erpSql = fs.readFileSync(erpPath, "utf8");

  // Fix mis-typed timestamp columns in ERP DDL that were typed as jsonb
  erpSql = erpSql
    .replace(/"createdAt"\s+"jsonb"/gi, '"createdAt" timestamp with time zone')
    .replace(/"updatedAt"\s+"jsonb"/gi, '"updatedAt" timestamp with time zone')
    .replace(/"changedAt"\s+"jsonb"/gi, '"changedAt" timestamp with time zone')
    .replace(/"changedat"\s+"jsonb"/gi, '"changedat" timestamp with time zone')
    .replace(/'\{"__kind":"serverTimestamp"\}'::jsonb/gi, 'NOW()')
    .replace(/'\{"__kind":"serverTimestamp"\}'/gi, 'NOW()');

  fullSql += `\n-- Precision Press ERP DDL\n` + erpSql + "\n";
}

// Step 3: Parse Backup SQL and Generate Fallback DDL & Column Patching
if (fs.existsSync(backupPath)) {
  console.log(`Analyzing Backup SQL from: ${backupPath}`);
  let backupSql = fs.readFileSync(backupPath, "utf8");

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

  console.log(`Generating Fallback DDL for backup tables...`);
  fullSql += `\n-- =============================================================================\n`;
  fullSql += `-- Auto-Generated Fallback DDL & Missing Column Patching\n`;
  fullSql += `-- =============================================================================\n`;

  for (const [key, spec] of tableMap.entries()) {
    // Skip auth schema DDL generation (managed by Supabase auth container)
    if (spec.schema === "auth") continue;

    const fullTableName = `"${spec.schema}"."${spec.table}"`;
    fullSql += `CREATE TABLE IF NOT EXISTS ${fullTableName} ("id" text);\n`;
    for (const col of spec.columns) {
      let colType = "text";
      const lowerCol = col.toLowerCase();
      if (lowerCol === "id") continue;

      // IMPORTANT: _percentage and _amount checks FIRST, before logistics substring check,
      // to prevent "allocated_logistics_percentage" / "allocated_logistics_amount" from being typed as jsonb.
      if (lowerCol.endsWith("_percentage") || lowerCol === "percentage" || (lowerCol.includes("percent") && !lowerCol.includes("logistics")) || (lowerCol.endsWith("_amount") && lowerCol !== "amounts")) {
        colType = "numeric";
      } else if ((lowerCol.includes("amount") && lowerCol !== "amounts" && !lowerCol.includes("words")) || (lowerCol.includes("total") && lowerCol !== "totals") || lowerCol.includes("price") || lowerCol.includes("cost") || lowerCol.includes("quantity") || (lowerCol.includes("rate") && !lowerCol.includes("generated")) || lowerCol.includes("limit") || lowerCol.includes("credit") || lowerCol.includes("taxable_value_snapshot") || lowerCol === "count" || lowerCol.endsWith("_count") || lowerCol.startsWith("count_")) {
        // numeric fields take priority over snapshot/jsonb check so taxable_value_snapshot, grand_total_snapshot resolve as numeric
        colType = "numeric";
      } else if (lowerCol === "amounts" || lowerCol === "totals" || lowerCol.includes("metadata") || lowerCol.includes("details") || lowerCol.includes("specs") || lowerCol.includes("items") || lowerCol.includes("snapshot") || lowerCol.includes("payload") || lowerCol.includes("addresses") || lowerCol.includes("config") || lowerCol.includes("data") || lowerCol.includes("logistics") || lowerCol.endsWith("_breakdown") || lowerCol.endsWith("_summary")) {
        colType = "jsonb";
      } else if (lowerCol === "workflow" || lowerCol.includes("words") || lowerCol.includes("text") || lowerCol.includes("note")) {
        colType = "text";
      } else if (lowerCol.endsWith("_at") || lowerCol.endsWith("at") || lowerCol.endsWith("_date") || lowerCol.endsWith("date") || lowerCol === "timestamp") {
        colType = "timestamp with time zone";
      } else if (lowerCol.startsWith("is_") || lowerCol.startsWith("has_") || lowerCol.endsWith("_generated") || lowerCol.includes("boolean")) {
        colType = "boolean";
      }
      fullSql += `ALTER TABLE ${fullTableName} ADD COLUMN IF NOT EXISTS "${col}" ${colType};\n`;
    }
  }

  // Relax constraints for tables with null values in NOT NULL columns
  fullSql += `ALTER TABLE "public"."document_jobs" ALTER COLUMN "attempts" DROP NOT NULL;\n`;
  fullSql += `ALTER TABLE "public"."document_jobs" ALTER COLUMN "maxAttempts" DROP NOT NULL;\n`;

  // Step 4: Transform Backup Inserts
  console.log("Transforming backup data insert statements...");
  fullSql += `\n-- =============================================================================\n`;
  fullSql += `-- Backup Data Insert Statements\n`;
  fullSql += `-- =============================================================================\n`;
  fullSql += `SET session_replication_role = 'replica';\n\n`;

  // Join multi-line SQL statements into single lines before processing.
  // Some backup generators (e.g. pg_dump) split INSERT ... VALUES\n(...); across two lines.
  // Our regex only handles single-line statements, so we join them first.
  const rawLines = backupSql.split("\n");
  const lines: string[] = [];
  let pendingStatement = "";
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("--")) {
      if (!pendingStatement) lines.push(rawLine); // preserve blank/comment lines outside statements
      continue;
    }
    pendingStatement = pendingStatement ? pendingStatement + " " + trimmed : trimmed;
    if (trimmed.endsWith(";")) {
      lines.push(pendingStatement);
      pendingStatement = "";
    }
  }
  if (pendingStatement) lines.push(pendingStatement); // flush any trailing unterminated statement

  const parentInserts: string[] = [];
  const childInserts: string[] = [];

  const parentTableNames = new Set([
    "public.organization",
    "public.users",
    "auth.users",
    "public.team",
    "public.contact",
    "public.warehouse",
    "public.categories",
    "public.pipeline",
    "public.inventory_category",
    "public.fiscal_year",
    "public.chart_account",
    "public.cost_center",
    "public.custom_role"
  ]);

  let fixedAuthUsersCount = 0;
  let skippedSchemaMigrationsCount = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line.trim() || line.trim().startsWith("--")) continue;

    // Skip auth.schema_migrations inserts to avoid permission errors
    if (line.includes('INSERT INTO "auth"."schema_migrations"') || line.includes("INSERT INTO auth.schema_migrations")) {
      skippedSchemaMigrationsCount++;
      continue;
    }

    // Skip orphaned "ON CONFLICT ..." lines — these are continuation lines from multi-line
    // INSERT statements in the backup (e.g. INSERT INTO ...\nON CONFLICT DO NOTHING;).
    // After we strip line 1 and append our own ON CONFLICT, line 2 becomes invalid SQL.
    if (/^\s*ON CONFLICT/i.test(line)) {
      continue;
    }

    // Replace any Firebase serverTimestamp JSON tokens with NOW()
    line = line.replace(/'\{"__kind":"serverTimestamp"\}'::jsonb/gi, 'NOW()').replace(/'\{"__kind":"serverTimestamp"\}'/gi, 'NOW()');

    if (line.includes('INSERT INTO "auth"."users"') || line.includes('INSERT INTO auth.users')) {
      line = stripAuthUsersGeneratedColumns(line);
      fixedAuthUsersCount++;
    }
    if (line.includes('INSERT INTO "auth"."identities"') || line.includes('INSERT INTO auth.identities')) {
      line = stripGeneratedColumns(line, "auth", "identities", new Set(["email"]));
    }
    // NOTE: public.users.email is a regular NOT NULL column, NOT a generated column.
    // Do NOT strip it — stripping causes null-constraint violations.

    // Determine target table for ordering
    const matchInsert = line.match(/INSERT INTO\s+(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/i);
    if (matchInsert) {
      const schema = (matchInsert[1] || "public").toLowerCase();
      const table = matchInsert[2].toLowerCase();
      const targetName = `${schema}.${table}`;

      if (parentTableNames.has(targetName)) {
        parentInserts.push(line);
      } else {
        childInserts.push(line);
      }
    } else {
      childInserts.push(line);
    }
  }

  console.log(`Transformed backup data: ${fixedAuthUsersCount} auth.users inserts stripped of generated columns, ${skippedSchemaMigrationsCount} schema_migrations skipped. ${parentInserts.length} parent inserts, ${childInserts.length} child inserts.`);

  fullSql += `-- Parent Table Inserts\n` + parentInserts.join("\n") + "\n\n";
  fullSql += `-- Child Table Inserts\n` + childInserts.join("\n") + "\n";
}

// Step 5: Re-enable Foreign Key Constraints
fullSql += `
-- Re-enable Foreign Key Constraints
SET session_replication_role = 'origin';
`;

const outputPath = path.join(drizzleDir, "self_hosted_full_init.sql");
fs.writeFileSync(outputPath, fullSql, "utf8");
console.log(`✅ Successfully generated master bundle: ${outputPath} (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB)`);
