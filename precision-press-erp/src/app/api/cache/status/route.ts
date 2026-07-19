import { NextResponse } from 'next/server';
import { getRedisHealth } from '@/lib/cache/health';
import { CACHE_VERSION } from '@/lib/cache/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getRedisHealth();
  
  return NextResponse.json({
    status: health.connected ? 'healthy' : 'degraded',
    version: CACHE_VERSION,
    redis: {
      connected: health.connected,
      latency: health.pingLatency,
      error: health.error,
      totalKeys: health.totalKeys,
      memoryUsage: health.memoryUsage,
    },
    metrics: health.metrics,
    timestamp: new Date().toISOString()
  });
}
