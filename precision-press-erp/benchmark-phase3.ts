import { warmupCache } from './src/lib/cache/warmup';
import { getCachedProductsList, invalidateProductsList } from './src/lib/cache/products';
import { invalidateCategories } from './src/lib/cache/config';
import { getRedisHealth } from './src/lib/cache/health';

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function measure(name: string, fn: () => Promise<any>) {
  const start = Date.now();
  await fn();
  const dur = Date.now() - start;
  console.log(`[MEASURE] ${name}: ${dur} ms`);
  return dur;
}

async function run() {
  console.log("=== STARTING PHASE 3 BENCHMARK ===");
  
  // Clear caches to simulate a Cold Server Start
  await invalidateProductsList();
  await invalidateCategories(); // and others...

  // 1. Cold Server Start (Warmup)
  console.log("\n--- Cold Server Start ---");
  await measure('Initial Cache Warmup', warmupCache);

  // 2. First User Load (after warmup)
  console.log("\n--- First User Load ---");
  await measure('First User - getCachedProductsList', getCachedProductsList);

  // 3. Subsequent User Load
  console.log("\n--- Subsequent User Loads ---");
  await measure('User 2 - getCachedProductsList', getCachedProductsList);
  await measure('User 3 - getCachedProductsList', getCachedProductsList);

  // 4. Redis Status & Dashboard Endpoint Payload
  console.log("\n--- Dashboard Health / Status ---");
  const health = await getRedisHealth();
  console.log(JSON.stringify(health, null, 2));

  console.log("\n=== DONE ===");
}

run().catch(console.error);
