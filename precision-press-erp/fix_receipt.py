import sys

content = open('src/lib/actions/accounts.ts', 'r', encoding='utf-8').read()

target_block = """  // 3. Insert into transactions table for the receipt register
  const { error: txErr } = await supabaseServer.from('transactions').insert({
    id: receiptEntryNumber,
    type: 'RECEIPT',
    ledgerType: 'RECEIPT',
    userId: customerId,
    credit: amount,
    debit: 0,
    timestamp: new Date().toISOString(),
    isVerified: true,
    refId: receiptEntryNumber,
    paymentId: refNumber,
    paymentMode: paymentMode,
    remarks: remarks,
    receipt_entry_number: receiptEntryNumber,
    sale_entry_number: allocations?.length > 0 ? allocations[0].orderId : null,
    link: allocations?.length > 0 ? allocations[0].orderId : null
  });

  if (txErr) {
    console.warn('Failed to insert into transactions table:', txErr.message);
  }

  return { success: true, receiptEntryNumber };"""

new_block = """  // 3. Pre-fetch invoice numbers and update orders if allocations exist
  const agstRefOrderIds = allocations?.map(a => a.orderId).filter(Boolean) || [];
  let invoiceNumberForLink = null;

  if (agstRefOrderIds.length > 0) {
    // 3a. Update receipt_created flag and receipt_entry_number on the orders
    await supabaseServer.from('orders').update({
      receipt_created: true,
      receipt_entry_number: receiptEntryNumber
    }).in('id', agstRefOrderIds);

    // 3b. Get the sale_entry_number (invoice number) from the orders to link the transaction
    const { data: orderData } = await supabaseServer.from('orders')
      .select('sale_entry_number')
      .in('id', agstRefOrderIds)
      .not('sale_entry_number', 'is', null)
      .limit(1);

    if (orderData && orderData.length > 0) {
      invoiceNumberForLink = orderData[0].sale_entry_number;
    } else {
      // Fallback to orderId if no invoice generated yet
      invoiceNumberForLink = agstRefOrderIds[0];
    }
  }

  // 4. Insert into transactions table for the receipt register
  const { error: txErr } = await supabaseServer.from('transactions').insert({
    id: receiptEntryNumber,
    type: 'RECEIPT',
    ledgerType: 'RECEIPT',
    userId: customerId,
    credit: amount,
    debit: 0,
    timestamp: new Date().toISOString(),
    isVerified: true,
    refId: receiptEntryNumber,
    paymentId: refNumber,
    paymentMode: paymentMode,
    remarks: remarks,
    receipt_entry_number: receiptEntryNumber,
    sale_entry_number: invoiceNumberForLink,
    link: invoiceNumberForLink
  });

  if (txErr) {
    console.warn('Failed to insert into transactions table:', txErr.message);
  }

  return { success: true, receiptEntryNumber };"""

if target_block in content:
    content = content.replace(target_block, new_block)
    open('src/lib/actions/accounts.ts', 'w', encoding='utf-8').write(content)
    print("Success")
else:
    print("Target not found")
