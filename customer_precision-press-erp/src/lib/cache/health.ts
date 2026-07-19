import { redis } from './redis';
import { getMetrics } from './metrics';

export async function getRedisHealth() {
  const start = Date.now();
  let connected = false;
  let pingLatency = 0;
  let totalKeys = 0;
  let memoryUsage = 'unknown';
  let error: string | null = null;

  if (redis) {
    try {
      const res = await redis.ping();
      if (res === 'PONG') {
        connected = true;
        pingLatency = Date.now() - start;
        
        try {
          totalKeys = await redis.dbsize();
          memoryUsage = 'N/A (Upstash Serverless)';
        } catch (e) {
          console.error('[Health] Failed to fetch additional metrics:', e);
        }
      } else {
        error = 'Unexpected ping response';
      }
    } catch (err: any) {
      error = err.message;
    }
  } else {
    error = 'Redis client not initialized (missing credentials)';
  }

  return {
    connected,
    pingLatency: `${pingLatency}ms`,
    error,
    totalKeys,
    memoryUsage,
    metrics: getMetrics()
  };
}
