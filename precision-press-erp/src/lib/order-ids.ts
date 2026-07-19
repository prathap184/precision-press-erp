// Centralized ID Generation for ERP V2
// Replaces Date.now().slice(-6) which caused silent collisions

export function generateUUIDShort(): string {
  // Uses crypto.randomUUID if available, else a fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Take the first 8 characters of a standard UUID
    return crypto.randomUUID().split('-')[0].toUpperCase();
  }
  // Fallback for older environments
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

import { supabaseServer } from './supabase-server';

export async function generateOrderId(): Promise<string> {
  const { data, error } = await supabaseServer.rpc('get_next_order_id');
  
  if (error || !data) {
    console.error('Failed to fetch next sequence ID, falling back to UUID:', error);
    return `ORD-${generateUUIDShort()}`;
  }
  
  return data;
}

export function generateChildOrderId(baseId: string, index: number): string {
  return `${baseId}-item${index}`;
}

export function generateInvoiceId(baseId: string): string {
  return `INV-${baseId.replace('ORD-', '')}`;
}

export function generateJobId(type: string, orderId: string): string {
  return `JOB-${type}-${orderId}-${generateUUIDShort()}`;
}
