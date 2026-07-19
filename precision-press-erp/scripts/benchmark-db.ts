import { performance } from 'perf_hooks';
import { getProducts } from '../src/lib/actions/products';
import { getCustomers } from '../src/lib/actions/users';
import { supabaseServer } from '../src/lib/supabase-server';

async function runBenchmark() {
  console.log('--- PRECISION PRESS ERP BASELINE BENCHMARK ---');
  
  // 1. Measure getProducts() (Firestore)
  console.log('Benchmarking Product Fetch (Firestore)...');
  const startProd = performance.now();
  try {
    const products = await getProducts();
    const endProd = performance.now();
    console.log(`✅ Loaded ${products.length} products in ${(endProd - startProd).toFixed(2)} ms`);
  } catch (err) {
    console.log(`❌ Failed to load products:`, err);
  }

  // 2. Measure getCustomers() (Supabase/Firestore)
  console.log('\nBenchmarking Customer Fetch...');
  const startCust = performance.now();
  try {
    const customers = await getCustomers();
    const endCust = performance.now();
    console.log(`✅ Loaded ${customers?.length || 0} customers in ${(endCust - startCust).toFixed(2)} ms`);
  } catch (err) {
    console.log(`❌ Failed to load customers:`, err);
  }

  // 3. Measure single Supabase Product Fetch (e.g. for workflow validation)
  console.log('\nBenchmarking Single Product Fetch (Supabase)...');
  const startSingleProd = performance.now();
  try {
    // Just fetch any 1 product to measure latency
    const { data } = await supabaseServer.from('products').select('id').limit(1);
    const endSingleProd = performance.now();
    console.log(`✅ Supabase single read in ${(endSingleProd - startSingleProd).toFixed(2)} ms`);
  } catch (err) {
    console.log(`❌ Failed single product read:`, err);
  }

  // 4. Measure Supabase Profile Fetch
  console.log('\nBenchmarking Single Profile Fetch (Supabase)...');
  const startSingleProf = performance.now();
  try {
    const { data } = await supabaseServer.from('profiles').select('id').limit(1);
    const endSingleProf = performance.now();
    console.log(`✅ Supabase profile read in ${(endSingleProf - startSingleProf).toFixed(2)} ms`);
  } catch (err) {
    console.log(`❌ Failed profile read:`, err);
  }

  console.log('\n--- BENCHMARK COMPLETE ---');
}

runBenchmark().catch(console.error);
