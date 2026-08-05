import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../lib/db/schema";
import { eq } from "drizzle-orm";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const db = drizzle(client, { schema });
const users = schema.users;

async function updateEmail() {
  const OLD_EMAIL = "demo@Pixel Marketing.dev";
  const NEW_EMAIL = "admin@gmail.com";

  const existing = await db.query.users.findFirst({
    where: eq(users.email, OLD_EMAIL),
    columns: { id: true, email: true, name: true },
  });

  if (!existing) {
    console.error(`❌ User with email "${OLD_EMAIL}" not found.`);
    process.exit(1);
  }

  console.log(`✅ Found user: ${existing.name} (${existing.email})`);

  await db.update(users)
    .set({ email: NEW_EMAIL })
    .where(eq(users.email, OLD_EMAIL));

  console.log(`✅ Email updated: ${OLD_EMAIL} → ${NEW_EMAIL}`);
  console.log(`✅ All data (invoices, journals, contacts) remains intact.`);
  console.log(`✅ Login with: ${NEW_EMAIL} / password123`);

  process.exit(0);
}

updateEmail().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
