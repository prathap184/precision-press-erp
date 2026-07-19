/**
 * Precision Press ERP — Load Benchmark Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests system response under concurrent user load across key endpoints.
 * 
 * Usage:
 *   npx ts-node scripts/load-benchmark.ts [--url http://localhost:3000] [--runs 3]
 *
 * Simulates: 1, 10, 50, 100, 250 concurrent users
 * Endpoints tested:
 *   - GET  /api/monitoring/health    (health check)
 *   - GET  /api/jobs/process         (job queue)
 *   - POST /api/auth/register        (auth - rate limited at 10/min)
 */

const BASE_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:3000';

const RUNS = process.argv.includes('--runs')
  ? parseInt(process.argv[process.argv.indexOf('--runs') + 1], 10)
  : 3;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EndpointResult {
  endpoint: string;
  method: string;
  concurrency: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  rateLimitedCount: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputRps: number;
  durationMs: number;
}

interface BenchmarkConfig {
  method: string;
  path: string;
  label: string;
  body?: () => Record<string, any>;
  headers?: Record<string, string>;
}

// ─── Benchmark Endpoints ──────────────────────────────────────────────────────

const ENDPOINTS: BenchmarkConfig[] = [
  {
    method: 'GET',
    path: '/api/monitoring/health',
    label: 'Health Check API',
  },
  {
    method: 'GET',
    path: '/api/jobs/process',
    label: 'Job Queue Trigger',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET || 'test-secret'}`,
    },
  },
  {
    method: 'POST',
    path: '/api/auth/register',
    label: 'Auth Register (rate limited)',
    body: () => ({
      email: `loadtest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      password: 'TestPass123!',
      role: 'CUSTOMER',
      name: 'Load Test User',
    }),
    headers: { 'Content-Type': 'application/json' },
  },
];

const CONCURRENCY_LEVELS = [1, 10, 50, 100, 250];

// ─── Request Helper ───────────────────────────────────────────────────────────

async function makeRequest(config: BenchmarkConfig): Promise<{
  status: number;
  durationMs: number;
  ok: boolean;
  rateLimited: boolean;
}> {
  const start = Date.now();
  try {
    const init: RequestInit = {
      method: config.method,
      headers: {
        ...(config.headers || {}),
      },
    };
    if (config.body) {
      init.body = JSON.stringify(config.body());
    }
    const res = await fetch(`${BASE_URL}${config.path}`, init);
    return {
      status: res.status,
      durationMs: Date.now() - start,
      ok: res.status >= 200 && res.status < 400,
      rateLimited: res.status === 429,
    };
  } catch (err) {
    return {
      status: 0,
      durationMs: Date.now() - start,
      ok: false,
      rateLimited: false,
    };
  }
}

// ─── Stats Helpers ────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ─── Run Benchmark ────────────────────────────────────────────────────────────

async function runBenchmark(
  config: BenchmarkConfig,
  concurrency: number,
  totalRequests: number
): Promise<EndpointResult> {
  const durations: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  let rateLimitedCount = 0;

  const startTime = Date.now();
  const batches = Math.ceil(totalRequests / concurrency);

  for (let b = 0; b < batches; b++) {
    const batchSize = Math.min(concurrency, totalRequests - b * concurrency);
    const promises = Array.from({ length: batchSize }, () => makeRequest(config));
    const results = await Promise.all(promises);
    for (const r of results) {
      durations.push(r.durationMs);
      if (r.rateLimited) rateLimitedCount++;
      else if (r.ok) successCount++;
      else errorCount++;
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const sorted = [...durations].sort((a, b) => a - b);

  return {
    endpoint: config.path,
    method: config.method,
    label: config.label,
    concurrency,
    totalRequests,
    successCount,
    errorCount,
    rateLimitedCount,
    minMs: sorted[0] || 0,
    maxMs: sorted[sorted.length - 1] || 0,
    avgMs: Math.round(mean(sorted)),
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    throughputRps: Math.round((totalRequests / totalDurationMs) * 1000),
    durationMs: totalDurationMs,
  } as EndpointResult;
}

// ─── Report Formatter ─────────────────────────────────────────────────────────

function printHeader() {
  console.log('\n' + '═'.repeat(100));
  console.log('  PRECISION PRESS ERP — LOAD BENCHMARK REPORT');
  console.log(`  Base URL: ${BASE_URL} · Runs: ${RUNS}`);
  console.log('═'.repeat(100));
}

function printTableHeader() {
  console.log(
    '\n' +
      [
        'Endpoint'.padEnd(38),
        'Users'.padStart(6),
        'Reqs'.padStart(6),
        'OK'.padStart(6),
        'Err'.padStart(5),
        'RL'.padStart(5),
        'Avg'.padStart(7),
        'p50'.padStart(7),
        'p95'.padStart(7),
        'p99'.padStart(7),
        'RPS'.padStart(7),
      ].join(' ')
  );
  console.log('-'.repeat(100));
}

function printRow(r: EndpointResult) {
  const okStatus = r.errorCount > 0 ? '⚠' : '✓';
  const rlNote = r.rateLimitedCount > 0 ? `(${r.rateLimitedCount} RL)` : '';
  console.log(
    [
      `${okStatus} ${r.method} ${r.endpoint}`.slice(0, 38).padEnd(38),
      String(r.concurrency).padStart(6),
      String(r.totalRequests).padStart(6),
      String(r.successCount).padStart(6),
      String(r.errorCount).padStart(5),
      String(r.rateLimitedCount).padStart(5),
      `${r.avgMs}ms`.padStart(7),
      `${r.p50Ms}ms`.padStart(7),
      `${r.p95Ms}ms`.padStart(7),
      `${r.p99Ms}ms`.padStart(7),
      `${r.throughputRps}`.padStart(7),
    ].join(' ')
  );
}

function printSummary(allResults: EndpointResult[]) {
  console.log('\n' + '─'.repeat(100));
  console.log('  SUMMARY');
  console.log('─'.repeat(100));

  const byEndpoint = allResults.reduce((acc, r) => {
    if (!acc[r.endpoint]) acc[r.endpoint] = [];
    acc[r.endpoint].push(r);
    return acc;
  }, {} as Record<string, EndpointResult[]>);

  for (const [endpoint, results] of Object.entries(byEndpoint)) {
    const highConcurrency = results.find(r => r.concurrency === 100) || results[results.length - 1];
    const status =
      highConcurrency.avgMs < 200 ? '🟢 FAST'
      : highConcurrency.avgMs < 800 ? '🟡 ACCEPTABLE'
      : '🔴 SLOW';

    console.log(`\n  ${endpoint}`);
    console.log(`    Status at 100 users: ${status} (avg ${highConcurrency.avgMs}ms, p99 ${highConcurrency.p99Ms}ms)`);
    if (highConcurrency.errorCount > 0) {
      console.log(`    ⚠ ${highConcurrency.errorCount} errors under load`);
    }
    if (highConcurrency.rateLimitedCount > 0) {
      console.log(`    ✓ Rate limiting working: ${highConcurrency.rateLimitedCount} requests blocked`);
    }
  }

  console.log('\n' + '═'.repeat(100));
  console.log('  RECOMMENDATIONS');
  console.log('─'.repeat(100));

  const slowResults = allResults.filter(r => r.concurrency >= 50 && r.avgMs > 800);
  if (slowResults.length === 0) {
    console.log('  ✓ All endpoints perform within acceptable thresholds under tested load.');
  } else {
    for (const r of slowResults) {
      console.log(`  ⚠ ${r.method} ${r.endpoint} at ${r.concurrency} concurrent users: avg ${r.avgMs}ms — consider caching or query optimization.`);
    }
  }

  const highErrorResults = allResults.filter(r => r.errorCount / r.totalRequests > 0.05);
  if (highErrorResults.length > 0) {
    for (const r of highErrorResults) {
      console.log(`  ⚠ ${r.method} ${r.endpoint} error rate ${((r.errorCount / r.totalRequests) * 100).toFixed(1)}% at ${r.concurrency} users — investigate.`);
    }
  }

  console.log('═'.repeat(100) + '\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();
  printTableHeader();

  const allResults: EndpointResult[] = [];

  for (const config of ENDPOINTS) {
    for (const concurrency of CONCURRENCY_LEVELS) {
      const totalRequests = concurrency * RUNS;
      const result = await runBenchmark(config, concurrency, totalRequests);
      allResults.push(result);
      printRow(result);
    }
    console.log('─'.repeat(100));
  }

  printSummary(allResults);
}

main().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
