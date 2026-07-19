import { 
  getCachedCategories, 
  getCachedRoles, 
  getCachedPermissions, 
  getCachedCompanySettings, 
  getCachedGSTSettings, 
  getCachedDeliverySettings,
  getCachedTallySettings,
  invalidateCategories,
  invalidateRoles,
  invalidatePermissions,
  invalidateCompanySettings,
  invalidateGSTSettings,
  invalidateDeliverySettings,
  invalidateTallySettings
} from './src/lib/cache/config';
import { getMetrics } from './src/lib/cache/metrics';

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function measure(name: string, fn: () => Promise<any>) {
  const start = Date.now();
  await fn();
  const end = Date.now();
  const dur = end - start;
  console.log(`[MEASURE] ${name}: ${dur} ms`);
  return dur;
}

async function run() {
  console.log("=== STARTING PHASE 2 BENCHMARK ===");
  
  console.log("\n--- Clearing Config Caches for Cold Start ---");
  await invalidateCategories();
  await invalidateRoles();
  await invalidatePermissions();
  await invalidateCompanySettings();
  await invalidateGSTSettings();
  await invalidateDeliverySettings();
  await invalidateTallySettings();

  console.log("\n--- Cold Cache Tests ---");
  await measure('Cold: getCachedCategories', getCachedCategories);
  await measure('Cold: getCachedRoles', getCachedRoles);
  await measure('Cold: getCachedPermissions', getCachedPermissions);
  await measure('Cold: getCachedCompanySettings', getCachedCompanySettings);
  await measure('Cold: getCachedGSTSettings', getCachedGSTSettings);
  await measure('Cold: getCachedDeliverySettings', getCachedDeliverySettings);
  await measure('Cold: getCachedTallySettings', getCachedTallySettings);

  console.log("\n--- Warm Cache Tests ---");
  await measure('Warm: getCachedCategories', getCachedCategories);
  await measure('Warm: getCachedRoles', getCachedRoles);
  await measure('Warm: getCachedPermissions', getCachedPermissions);
  await measure('Warm: getCachedCompanySettings', getCachedCompanySettings);
  await measure('Warm: getCachedGSTSettings', getCachedGSTSettings);
  await measure('Warm: getCachedDeliverySettings', getCachedDeliverySettings);
  await measure('Warm: getCachedTallySettings', getCachedTallySettings);

  console.log("\n--- Metrics Report ---");
  console.log(getMetrics());

  console.log("\n=== DONE ===");
}

run().catch(console.error);
