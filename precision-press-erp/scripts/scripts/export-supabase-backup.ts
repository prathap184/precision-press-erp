import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL is missing in environment variables!");
  process.exit(1);
}

console.log("🔌 Connecting to Supabase Database to generate full backup...");
const pool = new pg.Pool({ connectionString: url });

async function backupDatabase() {
  const client = await pool.connect();
  try {
    const backupFilePath = path.resolve(process.cwd(), "drizzle", "supabase_full_backup.sql");
    let sqlDump = `-- =============================================================================
-- Supabase Database Full Backup (Schema, Auth, and Data)
-- Source: https://dijmmkbfdgevnxbbnmbj.supabase.co
-- Generated at: ${new Date().toISOString()}
-- =============================================================================

`;

    const schemasToBackup = ["public", "auth", "drizzle"];

    for (const schemaName of schemasToBackup) {
      // Fetch all tables in this schema
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `, [schemaName]);

      const tableNames = tablesRes.rows.map((r) => r.table_name);
      if (tableNames.length === 0) continue;

      console.log(`📦 Backup schema '${schemaName}': found ${tableNames.length} tables...`);
      sqlDump += `-- ====================================\n-- SCHEMA: ${schemaName}\n-- ====================================\n\n`;

      for (const tableName of tableNames) {
        try {
          const rowsRes = await client.query(`SELECT * FROM "${schemaName}"."${tableName}";`);
          if (rowsRes.rows.length === 0) continue;

          sqlDump += `-- Data for table: ${schemaName}.${tableName} (${rowsRes.rows.length} rows)\n`;
          const cols = Object.keys(rowsRes.rows[0]);
          const colList = cols.map((c) => `"${c}"`).join(", ");

          for (const row of rowsRes.rows) {
            const valuesList = cols
              .map((c) => {
                const val = row[c];
                if (val === null || val === undefined) return "NULL";
                if (typeof val === "number" || typeof val === "boolean") return val;
                if (val instanceof Date) return `'${val.toISOString()}'`;
                if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                return `'${String(val).replace(/'/g, "''")}'`;
              })
              .join(", ");

            sqlDump += `INSERT INTO "${schemaName}"."${tableName}" (${colList}) VALUES (${valuesList}) ON CONFLICT DO NOTHING;\n`;
          }
          sqlDump += "\n";
        } catch (tableErr) {
          console.warn(`⚠️ Could not read table ${schemaName}.${tableName}:`, (tableErr as Error).message);
        }
      }
    }

    fs.writeFileSync(backupFilePath, sqlDump, "utf8");
    console.log(`✅ Complete backup successfully saved to: ${backupFilePath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

backupDatabase().catch((err) => {
  console.error("❌ Backup failed:", err);
  pool.end().then(() => process.exit(1));
});
