import { adminDb as db } from '../src/lib/firebase-admin';
import { redis } from '../src/lib/cache/redis';

async function run() {
  console.log("Fetching all products from Database...");
  const snapshot = await db.collection('products').get();
  const dbProducts = snapshot.docs.map(doc => doc.id);
  console.log(`Total Products in DB: ${dbProducts.length}`);

  console.log("Fetching from Redis...");
  if (!redis) {
    console.error("Redis is not connected.");
    process.exit(1);
  }

  // 1. Check list
  const listRaw = await redis.get('products:v1:list');
  const listData = typeof listRaw === 'string' ? JSON.parse(listRaw) : listRaw;
  const listIds = Array.isArray(listData) ? listData.map((p: any) => p.id) : [];
  console.log(`Total in products:v1:list: ${listIds.length}`);

  // 2. Check hash
  const hashData = await redis.hgetall('products:v1:hash');
  const hashIds = hashData ? Object.keys(hashData) : [];
  console.log(`Total in products:v1:hash: ${hashIds.length}`);

  // 3. Check individual product keys & workflow keys
  let productKeys: string[] = [];
  let cursor = 0;
  do {
    const res = await redis.scan(cursor, { match: 'product:v1:*', count: 1000 });
    cursor = res[0] === '0' ? 0 : parseInt(res[0] as string);
    productKeys.push(...res[1]);
  } while (cursor !== 0);
  const individualProductIds = productKeys.map(k => k.split(':').pop() || '');
  console.log(`Total individual product:v1:{id} keys: ${individualProductIds.length}`);

  let workflowKeys: string[] = [];
  cursor = 0;
  do {
    const res = await redis.scan(cursor, { match: 'workflow:v1:*', count: 1000 });
    cursor = res[0] === '0' ? 0 : parseInt(res[0] as string);
    workflowKeys.push(...res[1]);
  } while (cursor !== 0);
  const workflowProductIds = workflowKeys.map(k => k.split(':').pop() || '');
  console.log(`Total workflow:v1:{id} keys: ${workflowProductIds.length}`);

  // Compile Report
  console.log("\n=== MISSING PRODUCTS REPORT ===");
  console.log("ProductID | In DB | In v1:list | In v1:hash | In product:v1:{id} | In workflow:v1:{id}");
  
  const allIds = new Set([...dbProducts, ...listIds, ...hashIds, ...individualProductIds, ...workflowProductIds]);
  
  const report = Array.from(allIds).sort().map(id => {
    return {
      id,
      inDb: dbProducts.includes(id) ? 'Yes' : 'No',
      inList: listIds.includes(id) ? 'Yes' : 'No',
      inHash: hashIds.includes(id) ? 'Yes' : 'No',
      inIndividual: individualProductIds.includes(id) ? 'Yes' : 'No',
      inWorkflow: workflowProductIds.includes(id) ? 'Yes' : 'No',
    };
  });

  for (const row of report) {
    console.log(`${row.id.padEnd(9)} | ${row.inDb.padEnd(5)} | ${row.inList.padEnd(10)} | ${row.inHash.padEnd(10)} | ${row.inIndividual.padEnd(18)} | ${row.inWorkflow}`);
  }

  process.exit(0);
}

run().catch(console.error);
