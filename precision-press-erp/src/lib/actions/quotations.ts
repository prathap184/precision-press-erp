'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

export async function generateQuotationFromChildOrders(
  childOrderIds: string[],
  parentOrderId: string,
  customerId: string,
  actorId: string,
  actorName: string,
  quotationDate?: string
): Promise<{ success: boolean; quotationId?: string; quotationNumber?: string; error?: string }> {
  if (!childOrderIds || childOrderIds.length === 0) {
    return { success: false, error: 'No child orders selected.' };
  }

  try {
    const date = quotationDate || new Date().toISOString().split('T')[0];

    // 1. Fetch the child orders to build the snapshot
    const { data: childOrders, error: coErr } = await supabaseServer
      .from('orders')
      .select('id, taxable_value_snapshot, cgst_percentage, cgst_amount, sgst_percentage, sgst_amount, igst_percentage, igst_amount, gst_type, allocated_logistics_amount, grand_total_snapshot, item_amount, amounts, productName, customerSnapshot, items')
      .in('id', childOrderIds);

    if (coErr) throw new Error(coErr.message);
    const orders = childOrders || [];

    // Aggregate totals
    let totalTaxable   = 0;
    let totalCgst      = 0;
    let totalSgst      = 0;
    let totalIgst      = 0;
    let totalTransport = 0;
    let totalGrand     = 0;

    for (const order of orders) {
      const taxable    = order.taxable_value_snapshot ?? order.amounts?.subtotal ?? order.amounts?.productTotal ?? 0;
      const cgst       = order.cgst_amount             ?? (order.amounts?.cgst ?? 0);
      const sgst       = order.sgst_amount             ?? (order.amounts?.sgst ?? 0);
      const igst       = order.igst_amount             ?? (order.amounts?.igst ?? 0);
      const transport  = order.allocated_logistics_amount ?? 0;
      const grand      = order.grand_total_snapshot    ?? order.amounts?.grandTotal ?? 0;

      totalTaxable   += taxable;
      totalCgst      += cgst;
      totalSgst      += sgst;
      totalIgst      += igst;
      totalTransport += transport;
      totalGrand     += grand;
    }

    // Generate a quotation number
    const quotationNumber = `QT-${Date.now()}`;
    const quotationId = crypto.randomUUID();

    // 2. Create a QUOTATION entry in quotations table
    const { error: txErr } = await supabaseServer
      .from('quotations')
      .insert({
        id: quotationId,
        quotation_number: quotationNumber,
        customer_id: customerId,
        total_amount: Number(totalGrand.toFixed(2)),
        items: childOrderIds, // We can store the childOrderIds here in JSONB
        tax_details: {
          taxable: totalTaxable,
          cgst: totalCgst,
          sgst: totalSgst,
          igst: totalIgst,
          transport: totalTransport
        },
        tax_amount: Number((totalCgst + totalSgst + totalIgst).toFixed(2)),
        discount_amount: 0, // Discount can be added if we calculate from orders
        parent_order_id: parentOrderId,
        quotation_date: date,
        created_by: actorId
      });

    if (txErr) {
      throw new Error(txErr.message);
    }

    // 3. Optional: Insert into tally_sync_queue as a SALES_ORDER (Quotation)
    const { error: syncErr } = await supabaseServer
      .from('tally_sync_queue')
      .insert({
        voucher_type: 'Sales Order',
        voucher_date: date,
        reference_id: quotationId,
        status: 'PENDING',
        payload: {
          quotationNumber,
          customerId,
          totalAmount: totalGrand,
          items: childOrderIds,
          type: 'QUOTATION'
        }
      });

    if (syncErr) {
      console.warn('Failed to enqueue Tally sync for quotation:', syncErr.message);
    }

    // 4. Update child orders to indicate quotation has been generated
    const { error: updateErr } = await supabaseServer
      .from('orders')
      .update({
        quotation_generated: true,
        quotation_status: 'GENERATED'
      })
      .in('id', childOrderIds);

    if (updateErr) {
      console.warn('Failed to update orders with quotation status:', updateErr.message);
    }

    return { success: true, quotationId, quotationNumber };

  } catch (err: any) {
    console.error('[generateQuotationFromChildOrders] Error:', err);
    return { success: false, error: err.message };
  }
}
export async function createStandaloneQuotation(payload: any) {
  try {
    const token = cookies().get('token')?.value;
    if (!token) throw new Error('Unauthorized');
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');
    
    const quotationNumber = `QT-${Date.now()}`;
    const quotationId = crypto.randomUUID();
    
    const { error } = await supabaseServer.from('quotations').insert({
      id: quotationId,
      quotation_number: quotationNumber,
      customer_id: payload.customerId,
      total_amount: payload.grandTotal,
      items: payload.preparedItems,
      tax_details: {
        gstRate: payload.gstRate,
        isInterstate: payload.isInterstate
      },
      customer_snapshot: payload.customerSnapshot,
      logistics_details: {
        deliveryChoice: payload.deliveryChoice,
        shippingAddress: payload.shippingAddress,
        transportCharges: payload.transportCharges
      },
      status: 'PENDING',
      created_by: user.id
    });
    
    if (error) throw new Error(error.message);
    
    return { success: true, quotationId };
  } catch (error: any) {
    console.error('Quotation Creation Failed:', error);
    return { success: false, error: error.message };
  }
}

export async function getQuotationById(id: string) {
  const { data: quotation, error } = await supabaseServer
    .from('quotations')
    .select(`
      *,
      profiles (
        name,
        phone,
        email
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return quotation;
}

export async function updateQuotationStatus(id: string, status: 'ACCEPTED' | 'REJECTED') {
  const { error } = await supabaseServer
    .from('quotations')
    .update({ status })
    .eq('id', id);

  if (error) throw new Error(error.message);
  
  revalidatePath('/admin/quotation-register');
  revalidatePath(`/quotation/${id}`);
  
  return { success: true };
}
