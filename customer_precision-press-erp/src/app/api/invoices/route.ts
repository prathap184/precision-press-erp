import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const parentOrderId = searchParams.get('parentOrderId');
    const idOrNumber = searchParams.get('idOrNumber');
    const single = searchParams.get('single') === 'true';
    const childOrderId = searchParams.get('childOrderId');
    
    let q = supabase.from('invoices').select('*').order('created_at', { ascending: false });
    
    if (customerId) q = q.eq('customer_id', customerId);
    if (parentOrderId) q = q.eq('parent_order_id', parentOrderId);
    if (idOrNumber) {
      q = q.or(`id.eq.${idOrNumber},invoice_number.eq.${idOrNumber},parent_order_id.eq.${idOrNumber}`);
    }
    if (childOrderId) {
      q = q.contains('child_order_ids', [childOrderId]);
    }
    let finalQ: any = q;
    if (single) {
      finalQ = q.limit(1).maybeSingle();
    }
    
    const { data, error } = await finalQ;
    
    if (error) {
      console.error('Supabase error fetching invoices:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Error in /api/invoices:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
