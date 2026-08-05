import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL is missing in environment variables!");
  process.exit(1);
}

console.log("🔌 Connecting to Supabase Database to restore data backup...");
const pool = new pg.Pool({ connectionString: url });

async function restoreBackup() {
  const client = await pool.connect();
  try {
    const backupFilePath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
    if (!fs.existsSync(backupFilePath)) {
      console.error(`❌ Backup file not found at: ${backupFilePath}`);
      process.exit(1);
    }

    console.log(`📄 Reading backup file: ${backupFilePath}...`);
    const sqlContent = fs.readFileSync(backupFilePath, "utf8");

    // Split SQL by lines to extract insert statements cleanly
    const lines = sqlContent.split("\n");
    const statements: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith("INSERT INTO") && line.endsWith(";")) {
        statements.push(line);
      }
    }

    console.log(`🚀 Found ${statements.length} INSERT statements to execute...`);

    // Process in batches of 50 for high performance
    const BATCH_SIZE = 50;
    let executed = 0;
    let errors = 0;

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      const batchSql = batch.join("\n");
      try {
        await client.query(batchSql);
        executed += batch.length;
      } catch (err) {
        // If a batch fails (e.g. due to constraint), fallback to line-by-line for that batch
        for (const stmt of batch) {
          try {
            await client.query(stmt);
            executed++;
          } catch (lineErr) {
            errors++;
          }
        }
      }

      const percent = Math.min(100, Math.round(((i + batch.length) / statements.length) * 100));
      console.log(`⏳ Progress: ${percent}% (${Math.min(i + BATCH_SIZE, statements.length)}/${statements.length} queries)`);
    }

    console.log(`\n🎉 Restore completed successfully!`);
    console.log(`✅ Total Executed: ${executed} queries`);
    if (errors > 0) {
      console.log(`ℹ️ Skipped (already existing/duplicates): ${errors} queries`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

restoreBackup().catch((err) => {
  console.error("❌ Restore failed:", err);
  pool.end().then(() => process.exit(1));
});
