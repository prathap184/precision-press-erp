import { getCachedProductsList, getCachedProduct, getCachedWorkflow, invalidateProductsList, invalidateProduct } from './src/lib/cache/products';
import { getAdminProductsByCategory, createProduct } from './src/lib/actions/products';
import { getMetrics } from './src/lib/cache/metrics';

async function measure(name: string, fn: () => Promise<any>) {
  const start = Date.now();
  await fn();
  const end = Date.now();
  console.log(`[MEASURE] ${name}: ${end - start} ms`);
  return end - start;
}

async function run() {
  console.log("=== STARTING PRODUCT CREATE & INVALIDATION TEST ===");
  
  // 1. Create a dummy product
  const dummyId = "999999";
  
  console.log("\n1. Injecting dummy product into PostgreSQL...");
  const res = await createProduct({
    id: dummyId,
    name: "Benchmark Dummy Product",
    category: "SOLVENT",
    baseRate: 50,
    status: "ACTIVE",
    printerCategory: "SOLVENT_PRINT",
    eyeletPricing: { metal: 0, plastic: 0, none: 0 },
    deliveryPricing: { door: 0, courier: 0, transport: 0, selfPickup: 0 },
  });
  console.log("Create product result:", res);

  console.log("\n2. Fetching Product Details (Should be Cold Miss)");
  await measure('Cold: getCachedProduct', async () => {
    const p = await getCachedProduct(dummyId);
    console.log("Product Name:", p?.name);
  });
  
  console.log("\n3. Fetching Product Details Again (Should be Warm Hit)");
  await measure('Warm: getCachedProduct', async () => {
    const p = await getCachedProduct(dummyId);
    console.log("Product Name:", p?.name);
  });
  
  console.log("\n4. Triggering update/invalidation");
  await invalidateProduct(dummyId);

  console.log("\n5. Fetching Product Details Again (Should be Cold Miss after invalidation)");
  await measure('Cold: getCachedProduct (Post-invalidation)', async () => {
    await getCachedProduct(dummyId);
  });

  console.log("\n--- Metrics Report ---");
  console.log(getMetrics());
  
  console.log("\n=== DONE ===");
}

run().catch(console.error);
