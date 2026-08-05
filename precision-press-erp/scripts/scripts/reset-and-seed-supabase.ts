import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL is missing in environment variables!");
  process.exit(1);
}

console.log("🔌 Connecting to Supabase Database...");
const pool = new pg.Pool({ connectionString: url });

async function resetAndMigrate() {
  const client = await pool.connect();
  try {
    console.log("🧹 Dropping old tables and schemas in Supabase...");
    await client.query(`
      DROP SCHEMA IF EXISTS "drizzle" CASCADE;
      DROP SCHEMA IF EXISTS "public" CASCADE;
      CREATE SCHEMA "public";
      GRANT ALL ON SCHEMA "public" TO postgres;
      GRANT ALL ON SCHEMA "public" TO public;
    `);
    console.log("✅ Database cleared successfully!");

    const migrationsDir = path.resolve(process.cwd(), "drizzle");
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

    let fullSqlScript = `
-- =============================================================================
-- Complete Database Reset and Schema Initialization Script
-- Generated for Supabase / PostgreSQL Deployment
-- =============================================================================

DROP SCHEMA IF EXISTS "drizzle" CASCADE;
DROP SCHEMA IF EXISTS "public" CASCADE;
CREATE SCHEMA "public";
GRANT ALL ON SCHEMA "public" TO postgres;
GRANT ALL ON SCHEMA "public" TO public;

`;

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`🚀 Executing migration: ${file}...`);
        const sql = fs.readFileSync(filePath, "utf8");
        await client.query(sql);
        fullSqlScript += `\n-- ====================================\n-- Migration: ${file}\n-- ====================================\n` + sql + "\n";
      }
    }

    // Write out the single combined SQL script file
    const fullSqlPath = path.join(migrationsDir, "full_database_reset.sql");
    fs.writeFileSync(fullSqlPath, fullSqlScript, "utf8");
    console.log(`📄 Created single merged SQL file at: ${fullSqlPath}`);

    console.log("✅ All database migrations applied cleanly!");
  } finally {
    client.release();
  }
}

resetAndMigrate()
  .then(async () => {
    console.log("🌱 Now seeding default system accounts, currencies, demo org & user data...");
    const { seed } = await import("../lib/db/seed");
    await seed(false);
    console.log("🎉 Database reset and seeding completed successfully!");
    await pool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Reset & migration failed:", err);
    pool.end().then(() => process.exit(1));
  });
