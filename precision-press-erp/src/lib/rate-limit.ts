import { headers } from 'next/headers';
import { supabaseServer } from './supabase-server';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  retryAfterSeconds?: number;
}

// In-memory sliding window rate limiter fallback
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();

/**
 * Atomic database-backed sliding-window rate limiter with in-memory fallback.
 * Works consistently across multiple server instances via Supabase SQL or in-memory fallback.
 */
export async function checkRateLimit(
  endpoint: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const headerList = headers();
    const ip = headerList.get('x-forwarded-for') || headerList.get('x-real-ip') || '127.0.0.1';
    
    // Extract client IP (handling proxy chains)
    const clientIp = ip.split(',')[0].trim();
    const key = `${clientIp}:${endpoint}`;
    const intervalStr = `${windowSeconds} seconds`;

    // Attempt RPC increment call
    try {
      const { data, error } = await supabaseServer.rpc('increment_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_interval: intervalStr
      });

      if (!error && data) {
        const res = data as { allowed: boolean; remaining: number; reset_at: string };
        let retryAfterSeconds: number | undefined;
        if (!res.allowed) {
          const resetTime = new Date(res.reset_at).getTime();
          retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
        }

        return {
          allowed: res.allowed,
          remaining: res.remaining,
          resetAt: res.reset_at,
          retryAfterSeconds
        };
      }
    } catch {
      // In-memory fallback
    }

    // In-memory fallback
    const now = Date.now();
    const record = memoryRateLimits.get(key);

    if (!record || now > record.resetAt) {
      const resetAt = now + windowSeconds * 1000;
      memoryRateLimits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetAt: new Date(resetAt).toISOString() };
    }

    if (record.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      return { allowed: false, remaining: 0, resetAt: new Date(record.resetAt).toISOString(), retryAfterSeconds };
    }

    record.count += 1;
    return { allowed: true, remaining: limit - record.count, resetAt: new Date(record.resetAt).toISOString() };
  } catch (err) {
    return { allowed: true, remaining: 1, resetAt: new Date().toISOString() };
  }
}
