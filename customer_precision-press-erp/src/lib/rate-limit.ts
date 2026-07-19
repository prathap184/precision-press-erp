// @ts-nocheck
import { headers } from 'next/headers';
import { supabaseServer } from './supabase-server';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  retryAfterSeconds?: number;
}

/**
 * Atomic database-backed sliding-window rate limiter.
 * Works consistently across multiple server instances via Supabase SQL.
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

    // Atomic increment call via RPC
    const { data, error } = await supabaseServer.rpc('increment_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_interval: intervalStr
    });

    if (error) {
      console.error(`[Rate Limiter] Database RPC failed for ${endpoint}:`, error.message);
      // Fail open: prevent rate-limiter failure from blocking business services
      return { allowed: true, remaining: 1, resetAt: new Date().toISOString() };
    }

    const res = data as { allowed: boolean; remaining: number; reset_at: string };
    const allowed = res.allowed;
    const remaining = res.remaining;
    const resetAt = res.reset_at;

    let retryAfterSeconds: number | undefined;
    if (!allowed) {
      const resetTime = new Date(resetAt).getTime();
      retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
    }

    return {
      allowed,
      remaining,
      resetAt,
      retryAfterSeconds
    };
  } catch (err) {
    console.error(`[Rate Limiter] Fail open on unexpected error for ${endpoint}:`, err);
    return { allowed: true, remaining: 1, resetAt: new Date().toISOString() };
  }
}
