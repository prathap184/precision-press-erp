import { adminDb as db } from '../src/lib/firebase-admin';
import { getCachedProduct, getCachedWorkflow } from '../src/lib/cache/products';
import { redis } from '../src/lib/cache/redis';

async function run() {
  console.log("=== SEEDING CACHE ===");
  await getCachedWorkflow('6000'); // Force fetch and cache

  console.log("\n=== STEP 1: Direct Redis Values ===");
  if (redis) {
    const pValue = await redis.get('product:v1:6000');
    console.log("product:v1:6000 raw Redis value:", JSON.stringify(pValue));
    
    const wValue = await redis.get('workflow:v1:6000');
    console.log("workflow:v1:6000 raw Redis value:", JSON.stringify(wValue));
    console.log("workflow:v1:6000 typeof:", typeof wValue);
    console.log("workflow:v1:6000 is Array:", Array.isArray(wValue));
  }

  console.log("\n=== STEP 2: Tracing getCachedWorkflow ===");
  const steps = await getCachedWorkflow('6000');
  console.log("typeof steps:", typeof steps);
  console.log("Array.isArray(steps):", Array.isArray(steps));

  process.exit(0);
}

run().catch(console.error);
