import { redis } from './redis';

/**
 * Attempts to acquire a distributed lock for cache stampede prevention.
 * Uses the Stale-While-Revalidate pattern implicitly:
 * If acquired, the caller should rebuild the cache.
 * If not acquired, the caller should wait or gracefully return stale data.
 */
export async function acquireLock(key: string, timeoutSeconds: number = 10): Promise<boolean> {
  if (!redis) return true; // Bypass locks if Redis is disabled
  const lockKey = `lock:${key}`;
  try {
    // SET NX (Not eXists) ensures only 1 process can set this key.
    // EX (Expiration) ensures the lock automatically releases if the worker dies.
    const acquired = await redis.set(lockKey, 'LOCKED', { nx: true, ex: timeoutSeconds });
    return acquired === 'OK';
  } catch (err) {
    console.error(`[Redis Error] Failed to acquire lock for ${key}:`, err);
    return true; // Fail open to ensure the app doesn't freeze
  }
}

export async function releaseLock(key: string): Promise<void> {
  if (!redis) return;
  const lockKey = `lock:${key}`;
  try {
    await redis.del(lockKey);
  } catch (err) {
    console.error(`[Redis Error] Failed to release lock for ${key}:`, err);
  }
}
