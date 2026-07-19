/**
 * documents.ts
 *
 * Manual Invoice Generation API
 *
 * Invoices are NEVER generated automatically.
 * Staff explicitly selects child orders → clicks "Generate Invoice".
 * The generate_invoice_for_child_orders Supabase RPC handles atomic number
 * assignment and child order stamping.
 *
 * Invoice generation reads immutable snapshots stored on each child order —
 * it NEVER recalculates GST, logistics, or totals.
 */

import { supabaseServer } from '@/lib/supabase-server';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChildOrderSnapshot {
  id: string;
  parentOrderId: string | null;
  customerId: string;
  customerName: string;
  customerSnapshot: any;
  productName: string | null;
  // Immutable financial snapshot
  gst_type: 'CGST_SGST' | 'IGST' | null;
  cgst_percentage: number;
  cgst_amount: number;
  sgst_percentage: number;
  sgst_amount: number;
  igst_percentage: number;
  igst_amount: number;
  allocated_logistics_amount: number;
  allocated_logistics_percentage: number;
  item_amount: number;
  taxable_value_snapshot: number;
  grand_total_snapshot: number;
  // Invoice link
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_generated: boolean;
  invoice_generated_at: string | null;
  invoice_status: string;
  // Meta
  status: string;
  amounts: any;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_sequence: number;
  financial_year: string;
  parent_order_id: string;
  customer_id: string;
  status: string;
  invoice_date: string;
  child_order_ids: string[];
  item_count: number;
  transport_amount: number;
  taxable_value: number | null;
  cgst_rate: number | null;
  cgst_amount: number | null;
  sgst_rate: number | null;
  sgst_amount: number | null;
  igst_rate: number | null;
  igst_amount: number | null;
  grand_total: number | null;
  is_inter_state: boolean | null;
  customer_snapshot: any;
  company_snapshot: any;
  items: any[];
  pdf_url: string | null;
  generated_at: string | null;
  created_at: string;
}

export interface ParentOrderSummary {
  id: string;
  customerId: string;
  customerName: string;
  status: string;
  amounts: any;
  createdAt: string;
  updatedAt: string;
  childOrderIds: string[];
  // Derived
  totalChildOrders: number;
  invoicedChildOrders: number;
}

// ── Core: Generate Invoice ───────────────────────────────────────────────────

/**
 * Atomically generates an invoice for the selected child orders.
 * Calls the generate_invoice_for_child_orders Supabase RPC.
 * After success, updates the invoice row with the financial snapshot
 * aggregated from the selected child orders (read-only — no recalculation).
 */
export async function generateInvoiceFromChildOrders(
  childOrderIds: string[],
  parentOrderId: string,
  customerId: string,
  actorId: string,
  actorName: string,
  invoiceDate?: string
): Promise<{ success: boolean; invoiceId?: string; invoiceNumber?: string; error?: string }> {
  if (!childOrderIds || childOrderIds.length === 0) {
    return { success: false, error: 'No child orders selected.' };
  }

  try {
    const date = invoiceDate || new Date().toISOString().split('T')[0];

    // 1. Call the atomic RPC — assigns invoice number and stamps child orders
    const { data: rpcRows, error: rpcErr } = await supabaseServer.rpc(
      'generate_invoice_for_child_orders',
      {
        p_child_order_ids:  childOrderIds,
        p_parent_order_id:  parentOrderId,
        p_customer_id:      customerId,
        p_actor_id:         actorId,
        p_actor_name:       actorName,
        p_invoice_date:     date,
      }
    );

    if (rpcErr) throw new Error(rpcErr.message);
    const rpcResult = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!rpcResult?.success) {
      return { success: false, error: rpcResult?.message || 'Invoice generation failed.' };
    }

    const invoiceId     = rpcResult.invoice_id as string;
    const invoiceNumber = rpcResult.invoice_number as string;

    // 2. Fetch the child orders to build the immutable financial snapshot for the invoice row
    const { data: childOrders, error: coErr } = await supabaseServer
      .from('orders')
      .select('id, taxable_value_snapshot, cgst_percentage, cgst_amount, sgst_percentage, sgst_amount, igst_percentage, igst_amount, gst_type, allocated_logistics_amount, grand_total_snapshot, item_amount, amounts, productName, customerSnapshot, items')
      .in('id', childOrderIds);

    if (coErr) throw new Error(coErr.message);
    const orders = childOrders || [];

    // 3. Aggregate totals by pure addition — no calculation
    let totalTaxable   = 0;
    let totalCgst      = 0;
    let totalSgst      = 0;
    let totalIgst      = 0;
    let totalTransport = 0;
    let totalGrand     = 0;
    let totalCgstPct   = 0;
    let totalSgstPct   = 0;
    let totalIgstPct   = 0;
    let isInterstate   = false;

    const lineItems: any[] = [];
    const taxItems: any[] = [];

    for (const order of orders) {
      // Prefer immutable snapshot; fall back to amounts for legacy orders
      const taxable    = order.taxable_value_snapshot ?? order.amounts?.subtotal ?? order.amounts?.productTotal ?? 0;
      const cgst       = order.cgst_amount             ?? (order.amounts?.cgst ?? 0);
      const sgst       = order.sgst_amount             ?? (order.amounts?.sgst ?? 0);
      const igst       = order.igst_amount             ?? (order.amounts?.igst ?? 0);
      const transport  = order.allocated_logistics_amount ?? 0;
      const grand      = order.grand_total_snapshot    ?? order.amounts?.grandTotal ?? 0;
      const gstType    = order.gst_type as string | null;
      if (gstType === 'IGST') isInterstate = true;

      totalTaxable   += taxable;
      totalCgst      += cgst;
      totalSgst      += sgst;
      totalIgst      += igst;
      totalTransport += transport;
      totalGrand     += grand;

      // Use the first non-zero percentage found
      if (!totalCgstPct && order.cgst_percentage) totalCgstPct = order.cgst_percentage;
      if (!totalSgstPct && order.sgst_percentage) totalSgstPct = order.sgst_percentage;
      if (!totalIgstPct && order.igst_percentage) totalIgstPct = order.igst_percentage;

      const itemAmount = Number(order.item_amount ?? order.amounts?.productTotal ?? order.amounts?.subtotal) || 0;
      const finishAmount = Number(order.amounts?.finishCharges ?? order.amounts?.finish) || 0;

      let fbItem: any = null;
      try {
        const itemsArr = typeof order.items === 'string' ? JSON.parse(order.items) : (Array.isArray(order.items) ? order.items : []);
        if (itemsArr && itemsArr.length > 0) fbItem = itemsArr[0];
      } catch(e) {}

      const specs = fbItem?.specs || { width: fbItem?.width, height: fbItem?.height, widthUnit: fbItem?.widthUnit, heightUnit: fbItem?.heightUnit, quantity: fbItem?.quantity, sqft: fbItem?.sqft };
      const pricingSnapshot = fbItem?.pricingSnapshot || {};
      const hsnCode = order.hsn_code || fbItem?.hsnCode || pricingSnapshot?.hsnCode || '39219026';

      lineItems.push({
        sr: lineItems.filter(i => i.sr).length + 1,
        particulars: order.productName || order.amounts?.productName || 'Item ' + order.id.split('-').pop(),
        hsn_code: hsnCode,
        gst_percent: pricingSnapshot?.tax || (isInterstate ? (Number(order.igst_percentage) || 0) : ((Number(order.cgst_percentage) || 0) + (Number(order.sgst_percentage) || 0))),
        width: specs?.width ? `${specs.width} ${specs.widthUnit || ''}`.trim() : undefined,
        length: specs?.height ? `${specs.height} ${specs.heightUnit || ''}`.trim() : undefined,
        pcs: specs?.quantity || 1,
        rate_per_sq: pricingSnapshot?.baseRate || undefined,
        sqft: specs?.sqft || (pricingSnapshot?.baseRate ? Number((itemAmount / pricingSnapshot.baseRate).toFixed(2)) : undefined),
        qty: specs?.quantity || 1,
        unit: 'Nos',
        amount: itemAmount,
      });

      if (finishAmount > 0) {
        lineItems.push({ particulars: '    └─ Finish Charges', amount: finishAmount, gst_percent: '' });
      }
      if (isInterstate && igst > 0) {
        lineItems.push({ particulars: `    └─ IGST (${Number(order.igst_percentage) || 0}%)`, amount: igst, gst_percent: '' });
      } else {
        if (cgst > 0) lineItems.push({ particulars: `    └─ CGST (${Number(order.cgst_percentage) || 0}%)`, amount: cgst, gst_percent: '' });
        if (sgst > 0) lineItems.push({ particulars: `    └─ SGST (${Number(order.sgst_percentage) || 0}%)`, amount: sgst, gst_percent: '' });
      }

      lineItems.push({ particulars: '    └─ Item Total', amount: grand - transport, gst_percent: '' });

      if (transport > 0) {
        lineItems.push({ particulars: '    └─ Logistics', amount: transport, gst_percent: '' });
      }

      taxItems.push({
        particulars: order.productName || order.amounts?.productName || 'Item',
        taxable_value: taxable,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        cgst_rate: Number(order.cgst_percentage) || 0,
        sgst_rate: Number(order.sgst_percentage) || 0,
        igst_rate: Number(order.igst_percentage) || 0,
      });
    }

    // 4. Fetch the first child order's customer snapshot for the invoice header
    const firstOrder    = orders[0];
    const customerSnap  = firstOrder?.customerSnapshot || {};
    
    // Fetch live company template settings to permanently freeze into the invoice
    const { data: tmplData } = await supabaseServer
      .from('user_settings')
      .select('value')
      .eq('key', 'gst_invoice_template')
      .single();
    
    const taxTemplateSnapshot = tmplData?.value || { company_name: 'Hindustan Enterprises', gstin: '29AFHPP0687G1Z2' };

    // Fetch dispatch details to freeze into snapshot
    const fetchIds = [...childOrderIds, parentOrderId].filter(Boolean);
    const { data: dDataList } = await supabaseServer
      .from('dispatch_details')
      .select('*')
      .in('parent_order_id', fetchIds)
      .limit(1);
    
    if (dDataList && dDataList.length > 0) {
      customerSnap.dispatch = dDataList[0];
    }

    // Fetch parent order to get Buyer's Order Date
    const { data: parentOrder } = await supabaseServer
      .from('orders')
      .select('createdAt')
      .eq('id', parentOrderId)
      .single();
    if (parentOrder) {
      let parsedDate = parentOrder.createdAt;
      if (typeof parsedDate === 'string' && parsedDate.startsWith('"')) {
        parsedDate = parsedDate.replace(/"/g, '');
      }
      customerSnap.parent_order_created_at = parsedDate;
    }

    // Fetch transactions to get Mode/Terms of Payment
    const { data: transactionData } = await supabaseServer
      .from('transactions')
      .select('ledgerType')
      .eq('refId', parentOrderId)
      .limit(1);
    if (transactionData && transactionData.length > 0) {
      customerSnap.payment_mode = transactionData[0].ledgerType;
    }

    // 5. Update invoice row with aggregated financial snapshot
    const { error: updErr } = await supabaseServer
      .from('invoices')
      .update({
        customer_snapshot:      customerSnap,
        company_snapshot:       taxTemplateSnapshot,
        items:                  lineItems,
        taxable_value:          Number(totalTaxable.toFixed(2)),
        cgst_rate:              isInterstate ? 0 : totalCgstPct,
        cgst_amount:            isInterstate ? 0 : Number(totalCgst.toFixed(2)),
        sgst_rate:              isInterstate ? 0 : totalSgstPct,
        sgst_amount:            isInterstate ? 0 : Number(totalSgst.toFixed(2)),
        igst_rate:              isInterstate ? totalIgstPct : 0,
        igst_amount:            isInterstate ? Number(totalIgst.toFixed(2)) : 0,
        is_inter_state:         isInterstate,
        transport_amount:       Number(totalTransport.toFixed(2)),
        grand_total:            Number(totalGrand.toFixed(2)),
        child_order_ids:        childOrderIds,
        item_count:             childOrderIds.length,
        financial_lock_at:      new Date().toISOString(),
        generated_at:           new Date().toISOString(),
        finished_at:            new Date().toISOString(),
        status:                 'GENERATED',
      })
      .eq('id', invoiceId);

    if (updErr) {
      console.error('[generateInvoiceFromChildOrders] Failed to update invoice snapshot:', updErr.message);
      // RPC already succeeded — invoice number assigned, child orders stamped.
      // Log but don't throw; the invoice is valid.
    }

    // 6. Automatically create the Sale Entry (Ledger Debit) for this invoice
    try {
      const txId = invoiceNumber;
      const { error: txErr } = await supabaseServer.from('transactions').insert({
        id: txId,
        type: 'SALE',
        ledgerType: 'SALE',
        userId: customerId,
        credit: 0,
        debit: Number(totalGrand.toFixed(2)),
        timestamp: new Date().toISOString(),
        isVerified: true,
        refId: invoiceNumber,
        sale_entry_number: invoiceNumber,
        remarks: `Auto-generated from Invoice ${invoiceNumber}`,
        createdBy: actorName,
        verifiedBy: actorName,
        verifiedAt: {
          timestamp: new Date().toISOString(),
          name: actorName,
          role: 'System'
        }
      });
      if (txErr) {
        console.error('[generateInvoiceFromChildOrders] Ledger update failed:', txErr.message);
      } else {
        // Update orders to reflect the sale
        await supabaseServer.from('orders').update({
          sale_entry_number: invoiceNumber,
          sale_created: true,
          invoice_generated: true,
          invoice_status: 'COMPLETED',
          invoice_number: invoiceNumber,
          invoice_id: invoiceId
        }).in('id', childOrderIds);

        await supabaseServer.from('tally_sync_queue').insert({
          id: `TSYNC-S-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`.toUpperCase(),
          syncType: 'SALES_VOUCHER',
          customerId: customerId,
          idempotencyKey: `SALES_VOUCHER::${txId}`,
          status: 'PENDING',
          payload: {
            saleEntryNumber: invoiceNumber,
            customerId,
            totalAmount: Number(totalGrand.toFixed(2)),
            remarks: `Auto-generated from Invoice ${invoiceNumber}`,
            orderIds: childOrderIds,
            type: 'SALE',
            voucherDate: new Date().toISOString().split('T')[0]
          }
        });
      }
    } catch(e) {
      console.error('[generateInvoiceFromChildOrders] Ledger update exception:', e);
    }

    return { success: true, invoiceId, invoiceNumber };

  } catch (err: any) {
    console.error('[generateInvoiceFromChildOrders] Error:', err);
    return { success: false, error: err.message };
  }
}

// ── Query: Get child orders for a parent order ────────────────────────────────

export async function getChildOrdersForParent(
  parentOrderId: string
): Promise<ChildOrderSnapshot[]> {
  try {
    const { data, error } = await supabaseServer
      .from('orders')
      .select('*')
      .like('id', `${parentOrderId}-item%`)
      .order('id', { ascending: true });

    if (error) throw error;
    return (data || []) as ChildOrderSnapshot[];
  } catch (err: any) {
    console.error('[getChildOrdersForParent]', err);
    return [];
  }
}

// ── Query: Get parent orders for a customer ──────────────────────────────────

export async function getOrdersForCustomer(
  customerId: string,
  statuses?: string[]
): Promise<any[]> {
  try {
    const allowedStatuses = statuses || ['DISPATCHED', 'DELIVERED', 'READY_FOR_DISPATCH', 'COMPLETED'];
    const { data, error } = await supabaseServer
      .from('orders')
      .select('id, "customerId", "customerName", status, amounts, "createdAt", "updatedAt", "childOrderIds"')
      .eq('"customerId"', customerId)
      .in('status', allowedStatuses)
      .not('id', 'like', '%-item%')       // only parent orders
      .order('"createdAt"', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err: any) {
    console.error('[getOrdersForCustomer]', err);
    return [];
  }
}

// ── Query: Get invoice by ID ─────────────────────────────────────────────────

export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  try {
    const { data, error } = await supabaseServer
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();
    if (error) return null;
    return data as Invoice;
  } catch {
    return null;
  }
}

// ── Query: Get all invoices for a parent order ───────────────────────────────

export async function getInvoicesForParentOrder(parentOrderId: string): Promise<Invoice[]> {
  try {
    const { data, error } = await supabaseServer
      .from('invoices')
      .select('*')
      .eq('parent_order_id', parentOrderId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as Invoice[];
  } catch {
    return [];
  }
}

// ── Query: Get all invoices (admin listing) ──────────────────────────────────

export async function getAllInvoices(filters?: {
  customerId?: string;
  search?: string;
  limit?: number;
  status?: string;
}): Promise<Invoice[]> {
  try {
    let q = supabaseServer
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.customerId) q = q.eq('customer_id', filters.customerId);
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.limit) q = q.limit(filters.limit);

    const { data, error } = await q;
    if (error) throw error;

    let results = (data || []) as Invoice[];

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      results = results.filter(r =>
        r.invoice_number?.toLowerCase().includes(s) ||
        r.parent_order_id?.toLowerCase().includes(s) ||
        (r.customer_snapshot as any)?.name?.toLowerCase().includes(s) ||
        (r.customer_snapshot as any)?.displayName?.toLowerCase().includes(s)
      );
    }

    return results;
  } catch (err: any) {
    console.error('[getAllInvoices]', err);
    return [];
  }
}
