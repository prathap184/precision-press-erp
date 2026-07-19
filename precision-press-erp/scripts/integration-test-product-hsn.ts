import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We use dynamic imports to ensure env vars are set before module evaluation
async function runTests() {
  const { supabase } = await import('../src/lib/supabase');
  const { ProductService } = await import('../src/services/productService');
  console.log('--- Running Phase 2 Product HSN Integration Tests ---');
  let failures = 0;

  // 1. Create a mock HSN
  const testHsnCode = '99991111';
  await supabase.from('hsn_master').delete().eq('hsn_code', testHsnCode);
  
  const { data: hsn, error: hsnErr } = await supabase.from('hsn_master').insert({
    hsn_code: testHsnCode,
    description: 'Test HSN for Product Tests',
    is_active: true
  }).select().single();

  if (hsnErr) throw hsnErr;

  // Insert GST Rate
  await supabase.from('hsn_gst_rates').insert({
    hsn_id: hsn.id,
    gst_rate: 18.00,
    effective_from: '2024-01-01'
  });

  const testProductId = '99999';
  
  try {
    // Cleanup previous run
    await supabase.from('products').delete().eq('id', testProductId);

    // Test 1: Refresh GST on product that doesn't exist
    try {
      await ProductService.refreshGSTFromHSN('nonexistent', 'SYSTEM');
      failures++;
      console.error('❌ Test 1 Failed: Refreshing non-existent product should throw');
    } catch (e) {
      console.log('✅ Test 1 Passed: Throws on non-existent product');
    }

    // Insert mock product
    const { error: prodErr } = await supabase.from('products').insert({
      id: testProductId,
      name: 'Test Product',
      category: 'SOLVENT',
      base_rate: 10,
      hsn_master_id: hsn.id,
      hsn_code: testHsnCode,
      gst_rate: 18.00,
      gst_effective_from: '2024-01-01'
    });

    if (prodErr) throw prodErr;

    // Test 2: Refresh GST (No change scenario)
    await ProductService.refreshGSTFromHSN(testProductId, 'SYSTEM');
    const { data: p2 } = await supabase.from('products').select().eq('id', testProductId).single();
    if (p2.product_snapshot_version !== 1) {
      failures++;
      console.error('❌ Test 2 Failed: Snapshot version should not increment if no change');
    } else {
      console.log('✅ Test 2 Passed: No change refresh works');
    }

    // Test 3: Change GST Rate in Master, then refresh
    await supabase.from('hsn_gst_rates').insert({
      hsn_id: hsn.id,
      gst_rate: 12.00,
      effective_from: new Date().toISOString().split('T')[0] // Today
    });

    await ProductService.refreshGSTFromHSN(testProductId, 'SYSTEM');
    const { data: p3 } = await supabase.from('products').select().eq('id', testProductId).single();
    if (p3.gst_rate !== 12.00 || p3.product_snapshot_version !== 2) {
      failures++;
      console.error(`❌ Test 3 Failed: Product not updated properly. Rate: ${p3.gst_rate}, Version: ${p3.product_snapshot_version}`);
    } else {
      console.log('✅ Test 3 Passed: Product GST refreshed correctly');
    }

    // Verify Redis Cache invalidation
    const { getCachedProduct } = await import('../src/lib/cache/products');
    const cachedP3 = await getCachedProduct(testProductId);
    // Since refreshGSTFromHSN calls invalidateProduct internally via actions or Service, 
    // the cache should reflect the new GST rate or be null and then fetched
    if (cachedP3 && cachedP3.gst_rate !== 12.00) {
      failures++;
      console.error('❌ Test 3.5 Failed: Redis cache was not invalidated/updated');
    } else {
      console.log('✅ Test 3.5 Passed: Redis cache verified');
    }

    // Test 4: Audit Logs Generation
    const { data: audits } = await supabase.from('product_audit_logs').select().eq('product_id', testProductId);
    if (!audits || audits.length === 0 || audits[0].new_gst_rate !== 12.00) {
      failures++;
      console.error('❌ Test 4 Failed: Audit log not created or incorrect');
    } else {
      console.log('✅ Test 4 Passed: Audit log verified');
    }

  } finally {
    console.log('Cleaning up...');
    await supabase.from('products').delete().eq('id', testProductId);
    await supabase.from('hsn_master').delete().eq('hsn_code', testHsnCode);
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} tests failed!`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All tests passed successfully!`);
  }
}

runTests().catch(console.error);
