import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    const { contactIds, bankIds, accountIds, organizationId, cutoverDate } = await req.json();

    if (!organizationId) {
      return NextResponse.json({ success: false, error: 'Organization ID is required' }, { status: 400 });
    }

    let successCount = 0;
    const now = new Date().toISOString();

    // 1. Process Contacts
    if (contactIds && contactIds.length > 0) {
      const { data: contacts, error: fetchErr } = await supabaseServer
        .from('contact_tally')
        .select('*')
        .in('staging_id', contactIds)
        .eq('organization_id', organizationId);

      if (fetchErr) throw fetchErr;

      for (const c of contacts || []) {
        // Insert into real 'contact' table
        const { data: realContact, error: insertErr } = await supabaseServer
          .from('contact')
          .insert({
            organization_id: organizationId,
            name: c.name,
            type: c.type,
            tax_number: c.tax_number || null,
            email: c.email || null,
            phone: c.phone || null,
            // mapping address etc if needed
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error('Error inserting real contact:', insertErr);
          continue;
        }

        // Handle opening balance
        const balance = Number(c.tally_opening_balance) || 0;
        if (balance !== 0 && cutoverDate) {
          if (c.type === 'customer' && balance > 0) {
            // Customer owes us
            await supabaseServer.from('invoices').insert({
              organization_id: organizationId,
              customer_id: realContact.id,
              invoice_number: `OB-INV-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
              status: 'sent',
              issue_date: cutoverDate,
              due_date: cutoverDate,
              subtotal: balance,
              total: balance,
              amount_due: balance,
              notes: 'Tally Opening Balance',
            });
          } else if (c.type === 'supplier' && balance > 0) {
            // We owe supplier
            await supabaseServer.from('bills').insert({
              organization_id: organizationId,
              supplier_id: realContact.id,
              bill_number: `OB-BILL-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
              status: 'open',
              issue_date: cutoverDate,
              due_date: cutoverDate,
              subtotal: balance,
              total: balance,
              amount_due: balance,
              notes: 'Tally Opening Balance',
            });
          }
        }

        // Mark staging as imported
        await supabaseServer
          .from('contact_tally')
          .update({ import_status: 'imported', imported_contact_id: realContact.id })
          .eq('staging_id', c.staging_id);

        successCount++;
      }
    }

    // 2. Process Banks (simplified for now)
    if (bankIds && bankIds.length > 0) {
      await supabaseServer
        .from('bank_account_tally')
        .update({ import_status: 'imported' })
        .in('staging_id', bankIds);
      successCount += bankIds.length;
    }

    // 3. Process Accounts (simplified for now)
    if (accountIds && accountIds.length > 0) {
      await supabaseServer
        .from('chart_account_tally')
        .update({ import_status: 'imported' })
        .in('staging_id', accountIds);
      successCount += accountIds.length;
    }

    return NextResponse.json({ success: true, count: successCount });
  } catch (error: any) {
    console.error('Import ERP failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
