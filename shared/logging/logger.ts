/**
 * shared/logging/logger.ts
 *
 * Application-level logger for both ERP and Customer Portal.
 * Structured logging with level-based filtering.
 * In production, replace console calls with your logging provider (Datadog, Sentry, etc.)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

const isDev = process.env.NODE_ENV === 'development';

function formatEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.context ? ` [${entry.context}]` : ''} ${entry.message}`;
}

function writeLog(entry: LogEntry) {
  if (entry.level === 'debug' && !isDev) return; // Skip debug in production

  const formatted = formatEntry(entry);
  switch (entry.level) {
    case 'debug': console.debug(formatted, entry.data || ''); break;
    case 'info':  console.info(formatted, entry.data || '');  break;
    case 'warn':  console.warn(formatted, entry.data || '');  break;
    case 'error': console.error(formatted, entry.data || ''); break;
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>, context?: string) =>
    writeLog({ level: 'debug', message, data, context, timestamp: new Date().toISOString() }),

  info: (message: string, data?: Record<string, unknown>, context?: string) =>
    writeLog({ level: 'info', message, data, context, timestamp: new Date().toISOString() }),

  warn: (message: string, data?: Record<string, unknown>, context?: string) =>
    writeLog({ level: 'warn', message, data, context, timestamp: new Date().toISOString() }),

  error: (message: string, data?: Record<string, unknown>, context?: string) =>
    writeLog({ level: 'error', message, data, context, timestamp: new Date().toISOString() }),
};
