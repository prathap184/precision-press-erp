'use server';

import { createClient } from '@supabase/supabase-js';

export async function getCustomerQuotations(customerId: string) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await client
      .from('quotations')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['PENDING', 'ACCEPTED', 'REJECTED', 'ORDERED'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quotations:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Failed to fetch quotations:', err);
    return [];
  }
}

export async function getQuotationById(quotationId: string, customerId: string) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await client
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .eq('customer_id', customerId)
      .single();

    if (error) {
      console.error('Error fetching quotation:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Failed to fetch quotation:', err);
    return null;
  }
}

export async function acceptQuotation(quotationId: string, customerId: string) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { error } = await client
      .from('quotations')
      .update({ status: 'ACCEPTED' })
      .eq('id', quotationId)
      .eq('customer_id', customerId);

    if (error) {
      console.error('Error accepting quotation:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Failed to accept quotation:', err);
    return { success: false, error: err.message };
  }
}
