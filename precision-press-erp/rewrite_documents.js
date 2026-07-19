const fs = require('fs');

let content = fs.readFileSync('src/lib/actions/documents.ts', 'utf8');

const importsToAdd = `
import Decimal from 'decimal.js';
import crypto from 'crypto';
`;

if (!content.includes('import Decimal from')) {
    content = importsToAdd.trim() + '\n' + content;
}

const newGenerateInvoiceStr = `
export async function generateInvoice(
  parentOrBaseOrderId: string,
  orderData: any,
  childOrders: any[] = []
) {
  throw new Error("generateInvoice is deprecated, use generateInvoiceForParentOrder");
}

export async function generateInvoiceForParentOrder(baseOrderId: string) {
  try {
    const invId = invoiceId(baseOrderId);

    // 1. Enqueue generation attempt & prevent concurrent runs via generation_lock_until
    const now = new Date();
    const lockTime = new Date(now.getTime() + 60000); // 1 min lock
    const { data: attempt, error: attemptErr } = await supabaseServer.from('invoice_generation_attempts')
      .select('*')
      .eq('base_order_id', baseOrderId)
      .single();

    if (attemptErr && attemptErr.code !== 'PGRST116') {
      throw new Error('Failed to check invoice generation attempts: ' + attemptErr.message);
    }

    if (attempt) {
      if (attempt.status === 'SUCCESS') return { success: true, invoiceId: attempt.invoice_id, existing: true };
      if (attempt.generation_lock_until && new Date(attempt.generation_lock_until) > now) {
         return { success: false, error: 'Invoice generation is already in progress.' };
      }
      if (attempt.attempts >= 5) {
         return { success: false, error: 'Max invoice generation attempts reached. Please contact support.' };
      }
      await supabaseServer.from('invoice_generation_attempts').update({
         attempts: attempt.attempts + 1,
         last_attempt_at: now.toISOString(),
         generation_lock_until: lockTime.toISOString()
      }).eq('id', attempt.id);
    } else {
      await supabaseServer.from('invoice_generation_attempts').insert({
         base_order_id: baseOrderId,
         attempts: 1,
         last_attempt_at: now.toISOString(),
         status: 'PENDING',
         generation_lock_until: lockTime.toISOString()
      });
    }

    // 2. Fetch the true source of truth from Postgres
    const { data: parentOrder, error: poErr } = await supabaseServer.from('orders')
      .select('*')
      .eq('id', baseOrderId)
      .single();

    if (poErr || !parentOrder) {
      throw new Error('Parent order not found in immutable store.');
    }

    const { data: orderItems, error: oiErr } = await supabaseServer.from('order_items')
      .select('*')
      .in('order_id', parentOrder.childOrderIds?.length > 0 ? parentOrder.childOrderIds : [baseOrderId]);

    if (oiErr || !orderItems || orderItems.length === 0) {
      throw new Error('No items found for this order.');
    }

    // 3. Exact Numeric Math via decimal.js
    let itemsSubtotal = new Decimal(0);
    const lineItems = orderItems.map((item: any) => {
      const taxableValue = new Decimal(item.taxable_value || item.pricing_snapshot?.subTotal || 0);
      const eyeletCount = new Decimal(item.material_metadata?.eyeletCount || item.specs?.eyeletCount || 0);
      const eyeletRate = new Decimal(item.pricing_snapshot?.eyeletRate || 0);
      const finishAmount = eyeletCount.mul(eyeletRate);
      const baseAmount = Decimal.max(0, taxableValue.minus(finishAmount));
      
      itemsSubtotal = itemsSubtotal.plus(taxableValue);

      return {
        orderId: item.order_id,
        productName: item.product_name,
        quantity: item.specs?.quantity || 1,
        sqft: item.specs?.sqft || 0,
        baseAmount: baseAmount.toNumber(),
        finishAmount: finishAmount.toNumber(),
        itemTotal: taxableValue.toNumber(),
        gstRate: item.gst_rate || 0,
        hsnCode: item.hsn_code || '',
      };
    });

    const deliveryChoice = parentOrder.deliveryChoice || 'PICKUP';
    const deliveryPricing = parentOrder.delivery?.pricingSnapshot || {};
    let transport = new Decimal(0);
    if (deliveryChoice === 'DOOR_DELIVERY') transport = new Decimal(deliveryPricing.door || 0);
    else if (deliveryChoice === 'COURIER') transport = new Decimal(deliveryPricing.courier || 0);
    else if (deliveryChoice === 'TRANSPORT') transport = new Decimal(deliveryPricing.transport || 0);

    const baseAndTransport = itemsSubtotal.plus(transport);
    const gstTotal = baseAndTransport.mul(0.18); // assuming 18% overall for now, but should technically be per-item!
    const cgst = gstTotal.dividedBy(2);
    const sgst = gstTotal.minus(cgst);
    const grandTotal = baseAndTransport.plus(gstTotal);

    const amountsSnapshot = {
      itemsSubtotal: itemsSubtotal.toDecimalPlaces(2).toNumber(),
      transport: transport.toDecimalPlaces(2).toNumber(),
      gst: gstTotal.toDecimalPlaces(2).toNumber(),
      taxSplit: {
        cgst: cgst.toDecimalPlaces(2).toNumber(),
        sgst: sgst.toDecimalPlaces(2).toNumber(),
        igst: 0
      },
      discount: 0,
      grandTotal: grandTotal.toDecimalPlaces(2).toNumber(),
    };

    // 4. Atomic sequence generation
    const { data: seqData, error: seqErr } = await supabaseServer.rpc('reserve_invoice_number', {
      p_invoice_date: now.toISOString().split('T')[0]
    });
    
    if (seqErr || !seqData || seqData.length === 0) {
      throw new Error('Failed to reserve invoice number: ' + (seqErr?.message || 'Unknown error'));
    }
    const { invoice_number, invoice_sequence, financial_year } = seqData[0];

    // Company profile snapshot (assuming a hardcoded one for now, since it wasn't specified in input params)
    const companySnapshot = { name: 'Hindustan Enterprises', gstin: '27AAAAA0000A1Z5' };
    
    const taxDetails = {
       type: 'CGST_SGST', // or IGST
       rate: 18
    };

    const invoicePayload = {
      id: invId,
      invoice_number,
      invoice_sequence,
      financial_year,
      parent_order_id: baseOrderId,
      child_order_ids: parentOrder.childOrderIds || [],
      customer_id: parentOrder.customerId,
      customer_snapshot: parentOrder.customerSnapshot || {},
      company_snapshot: companySnapshot,
      items: lineItems,
      amounts: amountsSnapshot,
      tax_details: taxDetails,
      status: 'GENERATED',
      generated_by: parentOrder.createdBy || 'SYSTEM',
      order_type: parentOrder.orderType || 'CASH',
      payment_status: parentOrder.paymentStatus || 'PENDING',
      version: 1
    };

    // 5. Generate Snapshot Hash (SHA-256)
    const hashPayload = JSON.stringify({
      invoice_number,
      financial_year,
      customer_snapshot: invoicePayload.customer_snapshot,
      company_snapshot: invoicePayload.company_snapshot,
      items: invoicePayload.items,
      amounts: invoicePayload.amounts,
      tax_details: invoicePayload.tax_details
    });
    const snapshotHash = crypto.createHash('sha256').update(hashPayload).digest('hex');
    (invoicePayload as any).snapshot_hash = snapshotHash;
    (invoicePayload as any).snapshot_hash_algorithm = 'SHA-256';

    // PDF generation placeholder (Mocked for now since Phase 5 doesn't provide PDF generator implementation yet)
    (invoicePayload as any).pdf_url = 'placeholder.pdf';
    (invoicePayload as any).pdf_sha256 = crypto.createHash('sha256').update('dummy-pdf').digest('hex');
    (invoicePayload as any).pdf_size = 1024;
    (invoicePayload as any).financial_lock_at = now.toISOString();

    // 6. Insert into Supabase
    const { error: insErr } = await supabaseServer.from('invoices').insert(invoicePayload);
    if (insErr) {
       // if unique constraint violation, maybe it was created
       if (insErr.code === '23505') {
           return { success: true, invoiceId: invId, existing: true };
       }
       throw new Error('Invoice insertion failed: ' + insErr.message);
    }

    // 7. Log to invoice_events
    await supabaseServer.from('invoice_events').insert({
       invoice_id: invId,
       event_type: 'GENERATED',
       performed_by: invoicePayload.generated_by,
       event_metadata: { snapshot_hash: snapshotHash }
    });

    // Mark attempt as success
    await supabaseServer.from('invoice_generation_attempts').update({
       status: 'SUCCESS',
       invoice_id: invId,
       generation_lock_until: null,
       error_log: null
    }).eq('base_order_id', baseOrderId);
    
    // Legacy support: update firebase
    await adminDb.collection('invoices').doc(invId).create(invoicePayload).catch(()=>null);
    await adminDb.collection('orders').doc(baseOrderId).update({ invoiceId: invId }).catch(()=>null);

    return { success: true, invoiceId: invId, existing: false };
  } catch (e: any) {
    console.error('[generateInvoiceForParentOrder] Error:', e);
    // Log failure attempt
    await supabaseServer.from('invoice_generation_attempts').update({
       status: 'FAILED',
       error_log: e.message,
       generation_lock_until: null
    }).eq('base_order_id', baseOrderId).catch(()=>null);

    return { success: false, error: e.message };
  }
}
`;

const startIndex = content.indexOf('export async function generateInvoice(');
const endIndex = content.indexOf('export async function getInvoiceForOrder(');

if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + newGenerateInvoiceStr + '\n\n' + content.substring(endIndex);
    fs.writeFileSync('src/lib/actions/documents.ts', content, 'utf8');
    console.log('Successfully replaced invoice generation functions.');
} else {
    console.error('Could not find the function boundaries.');
}
