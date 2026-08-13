import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    let organizationId: string | undefined;
    try {
      const session = await auth();
      organizationId = session?.user?.organizationId;
    } catch (e) {
      console.warn('Auth session error, falling back to database org query:', e);
    }

    if (!organizationId) {
      const { data: org } = await supabaseServer
        .from('organization')
        .select('id')
        .limit(1)
        .maybeSingle();
      organizationId = org?.id || '00000000-0000-0000-0000-000000000002';
    }

    const { ledger } = await req.json();
    // ledger = { name, parent, gstin, state, openingBalance, closingBalance }

    if (!ledger?.name) {
      return NextResponse.json({ success: false, error: 'Ledger name is required' }, { status: 400 });
    }

    const parent = (ledger.parent || '').toLowerCase().replace(/&amp;/g, '&');
    const isCustomer  = ledger.parent === 'Sundry Debtors';
    const isSupplier  = ledger.parent === 'Sundry Creditors';
    const isBank      = ledger.parent === 'Bank Accounts';
    const isCash      = ledger.parent === 'Cash-in-Hand';

    // Helper to safely upsert into contact_tally without ON CONFLICT constraint error
    const saveContactTally = async (record: any) => {
      const { data: existing } = await supabaseServer
        .from('contact_tally')
        .select('staging_id')
        .eq('tally_ledger_name', record.tally_ledger_name)
        .eq('organization_id', record.organization_id)
        .maybeSingle();

      if (existing?.staging_id) {
        const { error } = await supabaseServer
          .from('contact_tally')
          .update(record)
          .eq('staging_id', existing.staging_id);
        if (error) throw error;
      } else {
        const { error } = await supabaseServer
          .from('contact_tally')
          .insert(record);
        if (error) throw error;
      }
    };

    // Helper to safely upsert into bank_account_tally without ON CONFLICT constraint error
    const saveBankTally = async (record: any) => {
      const { data: existing } = await supabaseServer
        .from('bank_account_tally')
        .select('staging_id')
        .eq('tally_ledger_name', record.tally_ledger_name)
        .eq('organization_id', record.organization_id)
        .maybeSingle();

      if (existing?.staging_id) {
        const { error } = await supabaseServer
          .from('bank_account_tally')
          .update(record)
          .eq('staging_id', existing.staging_id);
        if (error) throw error;
      } else {
        const { error } = await supabaseServer
          .from('bank_account_tally')
          .insert(record);
        if (error) throw error;
      }
    };

    // ── Route to correct table ────────────────────────────────────────────────

    if (isCustomer || isSupplier) {
      // → contact_tally
      await saveContactTally({
        organization_id:    organizationId,
        tally_ledger_name:  ledger.name,
        tally_ledger_group: ledger.parent,
        name:               ledger.name,
        type:               isCustomer ? 'customer' : 'supplier',
        tax_number:         ledger.gstin || null,
        import_status:      'pending',
      });

      return NextResponse.json({ success: true, table: 'contact_tally', type: isCustomer ? 'customer' : 'supplier' });
    }

    if (isBank || isCash) {
      // → bank_account_tally
      const isCashType = isCash || ledger.name.toLowerCase().includes('cash');
      await saveBankTally({
        organization_id: organizationId,
        tally_ledger_name: ledger.name,
        account_name: ledger.name,
        account_type: isCashType ? 'cash' : 'checking',
        import_status: 'pending',
      });

      return NextResponse.json({ success: true, table: 'bank_account_tally', type: isCashType ? 'cash' : 'bank' });
    }

    // Everything else → contact_tally with type = 'other' (as chart of accounts)
    await saveContactTally({
      organization_id:    organizationId,
      tally_ledger_name:  ledger.name,
      tally_ledger_group: ledger.parent,
      name:               ledger.name,
      type:               'other',
      import_status:      'pending',
    });

    return NextResponse.json({ success: true, table: 'contact_tally', type: 'other' });

  } catch (error: any) {
    console.error('sync-ledger error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
