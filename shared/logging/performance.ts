/**
 * shared/logging/performance.ts
 *
 * Lightweight performance measurement utilities.
 * Wraps functions to log their execution time.
 * Useful for API routes, DB queries, and pricing calculations.
 */

import { logger } from './logger';

/**
 * Measures and logs the execution time of an async function.
 * @param label   — A human-readable label for the operation
 * @param fn      — The async function to measure
 * @param warnMs  — Log a warning if execution exceeds this threshold (ms). Default: 500ms
 */
export async function measureAsync<T>(
  label: string,
  fn: () => Promise<T>,
  warnMs = 500
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    const data = { durationMs: Math.round(duration) };

    if (duration > warnMs) {
      logger.warn(`SLOW: ${label} took ${Math.round(duration)}ms`, data, 'performance');
    } else {
      logger.debug(`${label} completed in ${Math.round(duration)}ms`, data, 'performance');
    }

    return result;
  } catch (error) {
    const duration = performance.now() - start;
    logger.error(`${label} FAILED after ${Math.round(duration)}ms`, { error }, 'performance');
    throw error;
  }
}

/**
 * Synchronous version for non-async operations (e.g., pricing calculations).
 */
export function measureSync<T>(
  label: string,
  fn: () => T,
  warnMs = 50
): T {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    if (duration > warnMs) {
      logger.warn(`SLOW SYNC: ${label} took ${Math.round(duration)}ms`, { durationMs: Math.round(duration) }, 'performance');
    }
    return result;
  } catch (error) {
    logger.error(`${label} SYNC FAILED`, { error }, 'performance');
    throw error;
  }
}
