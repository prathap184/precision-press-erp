import fs from "node:fs";
import path from "node:path";

const drizzleDir = path.resolve(process.cwd(), "drizzle");
const erpDumpPath = path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql");

// Collect all created table names from Drizzle migrations
const createdTables = new Set<string>();

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
    const sql = fs.readFileSync(p, "utf8");
    const matches = sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi);
    for (const m of matches) {
      createdTables.add(m[2].toLowerCase());
    }
  }
}

if (fs.existsSync(erpDumpPath)) {
  const sql = fs.readFileSync(erpDumpPath, "utf8");
  const matches = sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi);
  for (const m of matches) {
    createdTables.add(m[2].toLowerCase());
  }
}

console.log(`Total created tables across migrations + ERP DDL: ${createdTables.size}`);

// Check tables in backup
const backupPath = path.join(drizzleDir, "supabase_full_backup.sql");
const backupSql = fs.readFileSync(backupPath, "utf8");

const insertMatches = backupSql.matchAll(/INSERT INTO\s+(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?/gi);
const backupTables = new Set<string>();
const missingTables = new Set<string>();

for (const m of insertMatches) {
  const schema = m[1] ? m[1].toLowerCase() : "public";
  const table = m[2].toLowerCase();
  const fullName = `${schema}.${table}`;
  backupTables.add(fullName);

  if (schema === "public" && !createdTables.has(table)) {
    missingTables.add(table);
  }
}

console.log(`\nTables in backup: ${backupTables.size}`);
console.log(`Missing public tables in DDL (${missingTables.size}):`, Array.from(missingTables).sort());
