import { CacheMetricsData } from './types';

// In-memory metrics tracking (per server instance)
export const metrics: CacheMetricsData = {
  hits: 0,
  misses: 0,
  errors: 0,
  latencySum: 0,
  latencyCount: 0,
  fallbacks: 0,
  rebuilds: 0,
  invalidations: 0,
  warmupDuration: 0,
  lastWarmupTime: null,
};

export function recordHit() { metrics.hits++; }
export function recordMiss() { metrics.misses++; }
export function recordError() { metrics.errors++; }
export function recordFallback() { metrics.fallbacks++; }
export function recordRebuild() { metrics.rebuilds++; }
export function recordInvalidation() { metrics.invalidations++; }
export function recordWarmup(durationMs: number) {
  metrics.warmupDuration = durationMs;
  metrics.lastWarmupTime = new Date().toISOString();
}
export function recordLatency(ms: number) {
  metrics.latencySum += ms;
  metrics.latencyCount++;
}

export function getMetrics() {
  return {
    ...metrics,
    avgLatency: metrics.latencyCount > 0 ? (metrics.latencySum / metrics.latencyCount).toFixed(2) + 'ms' : '0ms',
    hitRatio: metrics.hits + metrics.misses > 0 ? ((metrics.hits / (metrics.hits + metrics.misses)) * 100).toFixed(2) + '%' : '0%',
  };
}
