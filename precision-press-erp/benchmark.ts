import { getCachedProductsList, getCachedProduct, getCachedWorkflow, invalidateProductsList, invalidateProduct } from './src/lib/cache/products';
import { getAdminProductsByCategory } from './src/lib/actions/products';
import { getMetrics } from './src/lib/cache/metrics';
import { getProducts } from './src/lib/actions/products';

// Mock env for testing if needed
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function measure(name: string, fn: () => Promise<any>) {
  const start = Date.now();
  await fn();
  const end = Date.now();
  console.log(`[MEASURE] ${name}: ${end - start} ms`);
  return end - start;
}

async function run() {
  console.log("=== STARTING BENCHMARK & VERIFICATION ===");
  
  console.log("\n--- Clearing Caches for Cold Start ---");
  await invalidateProductsList();
  // Assume a default product ID exists for test. We'll fetch the list first to get an ID.
  const allProducts = await getProducts(); // Direct DB fetch
  if (allProducts.length === 0) {
    console.log("No products found in DB to test.");
    return;
  }
  const testProductId = allProducts[0].id;
  await invalidateProduct(testProductId);

  console.log(`\nUsing Test Product ID: ${testProductId}`);

  console.log("\n--- Cold Cache Tests ---");
  const coldListTime = await measure('Cold: getCachedProductsList (Product List Load)', async () => {
    await getCachedProductsList();
  });
  
  const coldProductTime = await measure('Cold: getCachedProduct (Product Details Load)', async () => {
    await getCachedProduct(testProductId);
  });
  
  const coldWorkflowTime = await measure('Cold: getCachedWorkflow (Workflow Load)', async () => {
    await getCachedWorkflow(testProductId);
  });

  console.log("\n--- Warm Cache Tests ---");
  const warmListTime = await measure('Warm: getCachedProductsList', async () => {
    await getCachedProductsList();
  });
  
  const warmProductTime = await measure('Warm: getCachedProduct', async () => {
    await getCachedProduct(testProductId);
  });
  
  const warmWorkflowTime = await measure('Warm: getCachedWorkflow', async () => {
    await getCachedWorkflow(testProductId);
  });
  
  const adminWarmTime = await measure('Warm: getAdminProductsByCategory', async () => {
    await getAdminProductsByCategory('SOLVENT', '', '');
  });

  console.log("\n--- Metrics Report ---");
  console.log(getMetrics());

  console.log("\n=== DONE ===");
}

run().catch(console.error);
