import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pool: pg.Pool | undefined;
};

let pool: pg.Pool;

if (!globalForDb.pool || (globalForDb as any).currentDbUrl !== process.env.DATABASE_URL) {
  if (globalForDb.pool) {
    globalForDb.pool.end().catch(() => {});
  }
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 30_000,
  });

  // Prevent process crash on idle connection errors (e.g. Neon auto-suspend).
  // node-postgres automatically removes the dead client and reconnects on next query.
  pool.on("error", (err) => {
    console.error("Unexpected pool client error:", err.message);
  });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.pool = pool;
    (globalForDb as any).currentDbUrl = process.env.DATABASE_URL;
  }
} else {
  pool = globalForDb.pool;
}

export const db = drizzle(pool, { schema });
