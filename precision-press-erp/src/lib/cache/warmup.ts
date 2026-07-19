import { getCachedProductsList, getCachedProduct, getCachedWorkflow } from './products';
import { 
  getCachedCategories, 
  getCachedRoles, 
  getCachedPermissions, 
  getCachedCompanySettings, 
  getCachedGSTSettings, 
  getCachedDeliverySettings 
} from './config';
import { recordWarmup } from './metrics';

export async function warmupCache() {
  const start = Date.now();
  console.log('[Cache Warmup] Starting...');
  
  try {
    // 1. Warm static configurations (parallel)
    await Promise.all([
      getCachedCategories(),
      getCachedRoles(),
      getCachedPermissions(),
      getCachedCompanySettings(),
      getCachedGSTSettings(),
      getCachedDeliverySettings(),
    ]);

    // 2. Warm products list
    const productsList = await getCachedProductsList();
    
    // 3. Warm top N accessed individual products & workflows 
    // (We will warm the first 10 products just to seed the most recent/common items without exhausting memory/time)
    const topProducts = productsList.slice(0, 10);
    await Promise.all(
      topProducts.map(async (p: any) => {
        await getCachedProduct(p.id);
        await getCachedWorkflow(p.id);
      })
    );

    const duration = Date.now() - start;
    recordWarmup(duration);
    console.log(`[Cache Warmup] Completed successfully in ${duration}ms.`);
    
    return { success: true, duration };
  } catch (err: any) {
    console.error(`[Cache Warmup] Failed:`, err);
    return { success: false, error: err.message };
  }
}
