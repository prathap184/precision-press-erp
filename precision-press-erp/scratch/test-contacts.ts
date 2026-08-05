import { db } from "../src/lib/db";
import { contact, organization } from "../src/lib/db/schema";

async function main() {
  try {
    const orgs = await db.select().from(organization);
    console.log("=== ORGANIZATIONS ===");
    console.log(orgs.map(o => ({ id: o.id, name: o.name })));
    
    const contacts = await db.select().from(contact);
    console.log("\n=== CONTACTS ===");
    console.log("Count:", contacts.length);
    console.log(contacts.map(c => ({ id: c.id, name: c.name, type: c.type, orgId: c.organizationId })));
  } catch (err) {
    console.error("Error querying DB:", err);
  } finally {
    process.exit(0);
  }
}
main();
