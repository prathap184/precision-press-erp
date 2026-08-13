import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { contactIds, bankIds, accountIds, organizationId: inputOrgId, cutoverDate } = await req.json();

    let organizationId = inputOrgId;
    if (!organizationId) {
      try {
        const session = await auth();
        organizationId = session?.user?.organizationId;
      } catch (e) {}
    }

    if (!organizationId) {
      const { data: org } = await supabaseServer
        .from('organization')
        .select('id')
        .limit(1)
        .maybeSingle();
      organizationId = org?.id || '00000000-0000-0000-0000-000000000002';
    }

    let successCount = 0;

    // 1. Process Contacts
    if (contactIds && contactIds.length > 0) {
      const { data: contacts, error: fetchErr } = await supabaseServer
        .from('contact_tally')
        .select('*')
        .in('staging_id', contactIds)
        .eq('organization_id', organizationId);

      if (fetchErr) throw fetchErr;

      for (const c of contacts || []) {
        const payload: any = {
          organization_id: organizationId,
          name: c.name,
          email: c.email || null,
          phone: c.phone || null,
          tax_number: c.tax_number || c.gstin || null,
          gstin: c.gstin || c.tax_number || null,
          gst_number: c.gst_number || c.gstin || c.tax_number || null,
          type: c.type || 'customer',
          payment_terms_days: c.payment_terms_days || 30,
          addresses: c.addresses || null,
          state: c.state || c.billing_state || null,
          billing_state: c.billing_state || c.state || null,
          billing_country: c.billing_country || 'India',
          notes: c.notes || null,
          currency_code: c.currency_code || 'INR',
          credit_limit: c.credit_limit || 0,
          tally_ledger_name: c.tally_ledger_name || c.name,
          tally_opening_balance: c.tally_opening_balance || 0,
          tally_closing_balance: c.tally_closing_balance || c.tally_opening_balance || 0,
        };

        if (c.imported_contact_id) {
          payload.id = c.imported_contact_id;
        }

        const { data: realContact, error: insertErr } = await supabaseServer
          .from('contact')
          .insert(payload)
          .select('id')
          .single();

        if (insertErr) {
          console.error('Error inserting real contact:', insertErr);
          continue;
        }

        // Mark staging as imported
        await supabaseServer
          .from('contact_tally')
          .update({ import_status: 'imported', imported_contact_id: realContact.id })
          .eq('staging_id', c.staging_id);

        successCount++;
      }
    }

    // 2. Process Banks
    if (bankIds && bankIds.length > 0) {
      const { data: banks, error: fetchErr } = await supabaseServer
        .from('bank_account_tally')
        .select('*')
        .in('staging_id', bankIds)
        .eq('organization_id', organizationId);

      if (fetchErr) throw fetchErr;

      for (const b of banks || []) {
        const payload: any = {
          organization_id: organizationId,
          account_name: b.account_name,
          account_number: b.account_number || null,
          bank_name: b.bank_name || null,
          currency_code: b.currency_code || 'INR',
          account_type: b.account_type || 'checking',
          balance: b.balance || b.tally_closing_balance || 0,
        };

        if (b.imported_bank_account_id) {
          payload.id = b.imported_bank_account_id;
        }

        const { data: realBank, error: insertErr } = await supabaseServer
          .from('bank_account')
          .insert(payload)
          .select('id')
          .single();

        if (insertErr) {
          console.error('Error inserting bank_account:', insertErr);
          continue;
        }

        await supabaseServer
          .from('bank_account_tally')
          .update({ import_status: 'imported', imported_bank_account_id: realBank.id })
          .eq('staging_id', b.staging_id);

        successCount++;
      }
    }

    // 3. Process Accounts
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
