import pg from "pg";
import fs from "node:fs";
import path from "node:path";

async function createWorkingPool() {
  const envUrl = process.env.TARGET_DATABASE_URL || process.env.OVERRIDE_DB_URL || process.env.DATABASE_URL;

  const candidateUrls = [
    envUrl,
    "postgresql://postgres.default:postgres@127.0.0.1:5432/postgres",
    "postgresql://postgres.local:postgres@127.0.0.1:5432/postgres",
    "postgresql://postgres.default:Powerstar%40200319@127.0.0.1:5432/postgres",
    "postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable",
    "postgresql://postgres:Powerstar%40200319@127.0.0.1:5432/postgres?sslmode=disable",
    "postgresql://supabase_admin:postgres@127.0.0.1:5432/postgres",
    "postgresql://supabase_admin:Powerstar%40200319@127.0.0.1:5432/postgres",
    "postgresql://postgres:postgres@172.17.0.1:5432/postgres",
    "postgresql://postgres:postgres@172.18.0.1:5432/postgres",
    "postgresql://postgres:postgres@172.19.0.1:5432/postgres",
  ].filter(Boolean) as string[];

  for (const connectionString of candidateUrls) {
    const masked = connectionString.replace(/:[^:@]+@/, ":****@");
    console.log(`🔍 Trying connection: ${masked}...`);
    const pool = new pg.Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 3000,
    });

    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      console.log(`✅ Connected successfully using: ${masked}`);
      return pool;
    } catch (err: any) {
      console.log(`   ❌ Connection failed (${err.message})`);
      await pool.end().catch(() => {});
    }
  }

  throw new Error("Unable to connect to database. Please check 'docker ps' to see active PostgreSQL port on your Azure VM!");
}

async function runQueryWithRetry(pool: pg.Pool, sql: string, maxRetries = 2): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await pool.query(sql);
      return { success: true };
    } catch (err: any) {
      if (attempt === maxRetries) {
        return { success: false, error: err.message };
      }
      await new Promise((res) => setTimeout(res, 100));
    }
  }
  return { success: false };
}

async function setupAndRestore() {
  const pool = await createWorkingPool();

  try {
    console.log("🧹 STEP 1: Wiping old tables/schema for a 100% clean refresh...");
    await pool.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `);
    console.log("✅ Schema wiped clean!");

    const possiblePaths = [
      path.resolve(process.cwd(), "..", "hindustan-erp", "precision-press-erp", "database_migration_dump_fixed.sql"),
      path.resolve(process.cwd(), "..", "Hindustan Enterprices", "precision-press-erp", "database_migration_dump_fixed.sql"),
      path.resolve(process.cwd(), "precision-press-erp", "database_migration_dump_fixed.sql"),
    ];

    let erpSql = "";
    let foundPath = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        erpSql = fs.readFileSync(p, "utf8");
        foundPath = p;
        break;
      }
    }

    if (erpSql) {
      console.log(`🛠️ STEP 2: Creating fresh ERP & table structures from ${foundPath}...`);
      const ddlStatements = erpSql
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("CREATE TABLE") || l.startsWith("CREATE SEQUENCE") || l.startsWith("CREATE OR REPLACE FUNCTION"));

      for (const ddl of ddlStatements) {
        await runQueryWithRetry(pool, ddl, 1);
      }
    }

    const backupFilePath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
    if (!fs.existsSync(backupFilePath)) {
      console.error(`❌ Backup file not found at: ${backupFilePath}`);
      process.exit(1);
    }

    console.log(`📄 STEP 3: Reading backup file: ${backupFilePath}...`);
    const sqlContent = fs.readFileSync(backupFilePath, "utf8");
    const lines = sqlContent.split("\n");
    const statements: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith("INSERT INTO") && line.endsWith(";")) {
        statements.push(line);
      }
    }

    console.log(`⚡ STEP 4: Restoring ALL ${statements.length} INSERT statements cleanly...`);

    const BATCH_SIZE = 50;
    let executed = 0;
    let errors = 0;

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      const batchSql = batch.join("\n");

      const res = await runQueryWithRetry(pool, batchSql, 1);
      if (res.success) {
        executed += batch.length;
      } else {
        for (const stmt of batch) {
          const lineRes = await runQueryWithRetry(pool, stmt, 1);
          if (lineRes.success) {
            executed++;
          } else {
            errors++;
          }
        }
      }

      const currentCount = Math.min(i + BATCH_SIZE, statements.length);
      const percent = Math.min(100, Math.round((currentCount / statements.length) * 100));
      console.log(`🚀 Clean Restore Progress: ${percent}% (${currentCount}/${statements.length} queries processed)`);
    }

    console.log(`\n🎉 CLEAN RESTORE COMPLETED!`);
    console.log(`✅ Successfully Inserted: ${executed} queries`);
    if (errors > 0) console.log(`ℹ️ Skipped: ${errors} queries`);

    console.log("\n📊 VERIFIED TABLE ROW COUNTS IN FRESH DATABASE:");
    const tablesToVerify = ["orders", "order_items", "invoice", "products", "chart_account", "activity_logs"];
    for (const table of tablesToVerify) {
      try {
        const countRes = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`   👉 ${table.padEnd(20)} : ${countRes.rows[0].count} rows`);
      } catch (err: any) {
        console.log(`   ❌ ${table.padEnd(20)} : Table check error (${err.message})`);
      }
    }
  } finally {
    await pool.end();
  }
}

setupAndRestore().catch((err) => {
  console.error("❌ Restore script error:", err.message || err);
  process.exit(1);
});
