const fs = require('fs');

let content = fs.readFileSync('src/lib/actions/documents.ts', 'utf8');

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
    const now = new Date();

    // 1. Fetch or initialize the invoice record
    let { data: invoice } = await supabaseServer.from('invoices').select('*').eq('id', invId).single();

    if (!invoice) {
        // Reserve invoice number
        const { data: seqData, error: seqErr } = await supabaseServer.rpc('reserve_invoice_number', {
            p_invoice_date: now.toISOString().split('T')[0]
        });
        if (seqErr || !seqData || seqData.length === 0) {
            throw new Error('Failed to reserve invoice number: ' + (seqErr?.message || 'Unknown error'));
        }
        const { invoice_number, invoice_sequence, financial_year } = seqData[0];

        // We need customer id from the order to create the row
        const { data: pOrder } = await supabaseServer.from('orders').select('customerId').eq('id', baseOrderId).single();
        if (!pOrder) throw new Error('Order not found');

        const { data: newInvoice, error: insErr } = await supabaseServer.from('invoices').insert({
            id: invId,
            invoice_number,
            invoice_sequence,
            financial_year,
            invoice_date: now.toISOString().split('T')[0],
            parent_order_id: baseOrderId,
            customer_id: pOrder.customerId,
            invoice_number_reserved_at: now.toISOString(),
            status: 'PENDING',
            generation_requested_at: now.toISOString(),
            attempt_count: 0
        }).select().single();

        if (insErr) {
            if (insErr.code === '23505') {
               const { data: ex } = await supabaseServer.from('invoices').select('*').eq('id', invId).single();
               invoice = ex;
            } else {
               throw new Error('Failed to initialize invoice: ' + insErr.message);
            }
        } else {
            invoice = newInvoice;
        }
    }

    if (!invoice) throw new Error('Invoice initialization failed.');

    // Idempotency check
    if (invoice.status === 'GENERATED' || invoice.financial_lock_at) {
        return { success: true, invoiceId: invId, existing: true };
    }

    // Concurrency lock check
    if (invoice.generation_lock_until && new Date(invoice.generation_lock_until) > now) {
        return { success: false, error: 'Invoice generation is already in progress.' };
    }

    if (invoice.attempt_count >= (invoice.max_attempts || 6)) {
        return { success: false, error: 'Max invoice generation attempts reached.' };
    }

    // Lock for generation
    const lockTime = new Date(now.getTime() + 60000);
    const attemptCount = (invoice.attempt_count || 0) + 1;
    await supabaseServer.from('invoices').update({
        generation_lock_until: lockTime.toISOString(),
        attempt_count: attemptCount,
        last_attempted_at: now.toISOString(),
        started_at: now.toISOString()
    }).eq('id', invId);

    try {
        // 2. Fetch the true source of truth from Postgres
        const { data: parentOrder, error: poErr } = await supabaseServer.from('orders')
          .select('*')
          .eq('id', baseOrderId)
          .single();

        if (poErr || !parentOrder) {
          throw new Error('Parent order not found in immutable store.');
        }

        const childOrderIds = parentOrder.childOrderIds?.length > 0 ? parentOrder.childOrderIds : [baseOrderId];
        const { data: orderItems, error: oiErr } = await supabaseServer.from('order_items')
          .select('*')
          .in('order_id', childOrderIds);

        if (oiErr || !orderItems || orderItems.length === 0) {
          console.log('childOrderIds:', childOrderIds, 'oiErr:', oiErr, 'orderItems:', orderItems); throw new Error('No items found for this order.');
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
            hsnDescription: item.hsn_description || '',
            gstEffectiveFrom: item.gst_effective_from || ''
          };
        });

        const deliveryChoice = parentOrder.deliveryChoice || 'PICKUP';
        const deliveryPricing = parentOrder.delivery?.pricingSnapshot || {};
        let transport = new Decimal(0);
        if (deliveryChoice === 'DOOR_DELIVERY') transport = new Decimal(deliveryPricing.door || 0);
        else if (deliveryChoice === 'COURIER') transport = new Decimal(deliveryPricing.courier || 0);
        else if (deliveryChoice === 'TRANSPORT') transport = new Decimal(deliveryPricing.transport || 0);

        const baseAndTransport = itemsSubtotal.plus(transport);
        const gstTotal = baseAndTransport.mul(0.18); 
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

        const companySnapshot = { name: 'Hindustan Enterprises', gstin: '27AAAAA0000A1Z5' };
        const taxDetails = { type: 'CGST_SGST', rate: 18 };

        // 5. Generate Snapshot Hash (SHA-256)
        const hashPayload = JSON.stringify({
          invoice_number: invoice.invoice_number,
          financial_year: invoice.financial_year,
            invoice_date: now.toISOString().split('T')[0],
          customer_snapshot: parentOrder.customerSnapshot || {},
          company_snapshot: companySnapshot,
          items: lineItems,
          amounts: amountsSnapshot,
          tax_details: taxDetails
        });
        const snapshotHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

        // PDF generation placeholder
        const pdfUrl = 'placeholder.pdf';
        const pdfSha256 = crypto.createHash('sha256').update('dummy-pdf').digest('hex');

        // 6. Update invoices table
        const updatePayload = {
          child_order_ids: childOrderIds,
          customer_snapshot: parentOrder.customerSnapshot || {},
          company_snapshot: companySnapshot,
          items: lineItems as any,
          amounts: amountsSnapshot,
          tax_details: taxDetails,
          status: 'GENERATED',
          generated_by: parentOrder.createdBy || 'SYSTEM',
          order_type: parentOrder.orderType || 'CASH',
          payment_status: parentOrder.paymentStatus || 'PENDING',
          is_inter_state: false,
          snapshot_hash: snapshotHash,
          snapshot_hash_algorithm: 'SHA-256',
          pdf_url: pdfUrl,
          pdf_sha256: pdfSha256,
          pdf_size: 1024,
          financial_lock_at: now.toISOString(),
          generated_at: now.toISOString(),
          finished_at: now.toISOString(),
          generation_lock_until: null,
          generation_version: 1,
          last_error: null
        };

        const { error: updErr } = await supabaseServer.from('invoices').update(updatePayload).eq('id', invId);
        if (updErr) throw new Error('Invoice update failed: ' + updErr.message);

        // 7. Log to invoice_generation_attempts and invoice_events
        await supabaseServer.from('invoice_generation_attempts').insert({
           invoice_id: invId,
           attempt_number: attemptCount,
           started_at: now.toISOString(),
           finished_at: new Date().toISOString(),
           result_status: 'SUCCESS'
        });

        await supabaseServer.from('invoice_events').insert({
           invoice_id: invId,
           event_type: 'GENERATED',
           performed_by: parentOrder.createdBy || 'SYSTEM',
           event_metadata: { snapshot_hash: snapshotHash }
        });
        
        return { success: true, invoiceId: invId, existing: false };

    } catch (innerError: any) {
        // Rollback lock and log failure
        await supabaseServer.from('invoices').update({
           generation_lock_until: null,
           last_error: innerError.message,
           finished_at: new Date().toISOString()
        }).eq('id', invId);

        await supabaseServer.from('invoice_generation_attempts').insert({
           invoice_id: invId,
           attempt_number: attemptCount,
           started_at: now.toISOString(),
           finished_at: new Date().toISOString(),
           result_status: 'FAILED',
           error_message: innerError.message
        });

        await supabaseServer.from('invoice_events').insert({
           invoice_id: invId,
           event_type: 'GENERATION_FAILED',
           performed_by: 'SYSTEM',
           event_metadata: { error: innerError.message }
        });

        throw innerError;
    }

  } catch (e: any) {
    console.error('[generateInvoiceForParentOrder] Error:', e);
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
