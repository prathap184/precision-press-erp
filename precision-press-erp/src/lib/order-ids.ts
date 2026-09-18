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
  
  if (!error && data) {
    const { data: existing } = await supabaseServer.from('orders').select('id').eq('id', data).maybeSingle();
    if (!existing) {
      return data;
    }
  }
  
  // Sequential fallback (e.g. ORD-0001, ORD-0002...)
  try {
    const { data: rows, error: rowsErr } = await supabaseServer
      .from('orders')
      .select('id')
      .ilike('id', 'ORD-%');

    let maxNum = 0;
    if (rows && Array.isArray(rows) && rows.length > 0) {
      for (const r of (rows as any[])) {
        const base = (r?.id || '').split('-item')[0].trim();
        const match = base.match(/^ORD-0*([1-9]\d{0,4})$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    let nextNum = maxNum + 1;
    let candidate = `ORD-${String(nextNum).padStart(4, '0')}`;

    // Collision check guard
    while (true) {
      const { data: ex } = await supabaseServer.from('orders').select('id').eq('id', candidate).maybeSingle();
      if (!ex) break;
      nextNum++;
      candidate = `ORD-${String(nextNum).padStart(4, '0')}`;
    }

    return candidate;
  } catch (seqErr) {
    console.error('Failed to compute sequential order ID, falling back to UUID:', seqErr);
    return `ORD-${generateUUIDShort()}`;
  }
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

export async function generateQuotationNumber(): Promise<string> {
  try {
    const { data: rows, error: rowsErr } = await supabaseServer
      .from('quotations')
      .select('quotation_number')
      .ilike('quotation_number', 'QU-%');

    let maxNum = 0;
    if (rows && Array.isArray(rows) && rows.length > 0) {
      for (const r of (rows as any[])) {
        const qNum = (r?.quotation_number || '').trim();
        const match = qNum.match(/^QU-0*([1-9]\d{0,4})$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    let nextNum = maxNum + 1;
    let candidate = `QU-${String(nextNum).padStart(4, '0')}`;

    // Collision check guard
    while (true) {
      const { data: ex } = await supabaseServer.from('quotations').select('id').eq('quotation_number', candidate).maybeSingle();
      if (!ex) break;
      nextNum++;
      candidate = `QU-${String(nextNum).padStart(4, '0')}`;
    }

    return candidate;
  } catch (seqErr) {
    console.error('Failed to compute sequential quotation number:', seqErr);
    return `QU-0001`;
  }
}

