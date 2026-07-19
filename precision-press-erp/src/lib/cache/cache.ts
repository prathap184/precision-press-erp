import { redis } from './redis';
import { recordHit, recordMiss, recordError, recordFallback, recordLatency, recordRebuild, recordInvalidation } from './metrics';

/**
 * Generic Cache Wrapper
 * Automatically handles JSON serialization, metrics, timing, and graceful fallback to PostgreSQL.
 */
export async function getOrSetCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds?: number
): Promise<T> {
  const start = Date.now();

  // 1. Graceful Fallback if Redis is totally unconfigured or down
  if (!redis) {
    recordFallback();
    return await fetcher();
  }

  try {
    // 2. Try to fetch from Redis
    const cachedData = await redis.get<T>(key);
    recordLatency(Date.now() - start);

    if (cachedData !== null) {
      recordHit();
      return cachedData;
    }
  } catch (err) {
    // 3. Fallback on Error
    console.error(`[Redis Error] Failed to read key ${key}:`, err);
    recordError();
    recordFallback();
    return await fetcher();
  }

  // 4. Cache Miss - Execute fetcher
  recordMiss();
  recordRebuild();
  
  let freshData: T;
  try {
    freshData = await fetcher();
  } catch (err) {
    // If the fetcher fails (e.g. Postgres is down), we must bubble the error up.
    throw err;
  }

  try {
    // 5. Store in Cache asynchronously (don't block the return)
    if (freshData !== undefined && freshData !== null) {
      if (ttlSeconds) {
        redis.set(key, freshData, { ex: ttlSeconds }).catch(err => {
           console.error(`[Redis Error] Failed to set key ${key}:`, err);
           recordError();
        });
      } else {
        redis.set(key, freshData).catch(err => {
           console.error(`[Redis Error] Failed to set key ${key}:`, err);
           recordError();
        });
      }
    }
  } catch (err) {
    recordError();
  }

  return freshData;
}

export async function invalidate(key: string) {
  if (!redis) return;
  try {
    await redis.del(key);
    recordInvalidation();
  } catch (err) {
    recordError();
    console.error(`[Redis Error] Failed to invalidate key ${key}:`, err);
  }
}

export async function invalidateMultiple(keys: string[]) {
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
    recordInvalidation();
  } catch (err) {
    recordError();
    console.error(`[Redis Error] Failed to invalidate keys:`, err);
  }
}
