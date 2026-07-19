import { getPrinterQueue } from './src/lib/actions/reports';
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
  console.log("=== BENCHMARK: getPrinterQueue ===");
  await measure('Cold Run 1', getPrinterQueue);
  await measure('Warm Run 2', getPrinterQueue);
}

run().catch(console.error);
