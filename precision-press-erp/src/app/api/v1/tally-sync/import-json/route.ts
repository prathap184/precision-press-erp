import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { contacts, banks, accounts, organizationId, cutoverDate } = await req.json();

    if (!organizationId) {
      return NextResponse.json({ success: false, error: 'Organization ID is required' }, { status: 400 });
    }

    let successCount = 0;

    // ─── 1. Save to contact_tally (staging) ──────────────────────────────────
    if (contacts && contacts.length > 0) {
      for (const c of contacts) {
        const balance = Number(c.closingBalance ?? c.tally_opening_balance) || 0;

        const { error } = await supabaseServer
          .from('contact_tally')
          .upsert({
            organization_id:       organizationId,
            tally_ledger_name:     c.name,
            name:                  c.name,
            type:                  c.parent === 'Sundry Creditors' ? 'supplier' : 'customer',
            tally_parent_group:    c.parent || '',
            tally_opening_balance: balance,
            gstin:                 c.gstin || null,
            state:                 c.state  || null,
            cutover_date:          cutoverDate || null,
            synced_at:             new Date().toISOString(),
          }, { onConflict: 'organization_id,tally_ledger_name' });

        if (!error) successCount++;
        else console.error('contact_tally insert error:', error.message);
      }
    }

    // ─── 2. Save to bank_account_tally (staging) ─────────────────────────────
    if (banks && banks.length > 0) {
      for (const bank of banks) {
        const balance = Number(bank.closingBalance ?? bank.balance) || 0;

        const { error } = await supabaseServer
          .from('bank_account_tally')
          .upsert({
            organization_id:    organizationId,
            tally_ledger_name:  bank.name,
            account_name:       bank.name,
            tally_parent_group: bank.parent || '',
            balance:            balance,
            currency_code:      'INR',
            cutover_date:       cutoverDate || null,
            synced_at:          new Date().toISOString(),
          }, { onConflict: 'organization_id,tally_ledger_name' });

        if (!error) successCount++;
        else console.error('bank_account_tally insert error:', error.message);
      }
    }

    // ─── 3. Save to chart_account_tally (staging) ────────────────────────────
    if (accounts && accounts.length > 0) {
      for (const acc of accounts) {
        const balance = Number(acc.closingBalance ?? acc.balance) || 0;

        const { error } = await supabaseServer
          .from('chart_account_tally')
          .upsert({
            organization_id:    organizationId,
            tally_ledger_name:  acc.name,
            name:               acc.name,
            tally_parent_group: acc.parent || '',
            balance:            balance,
            cutover_date:       cutoverDate || null,
            synced_at:          new Date().toISOString(),
          }, { onConflict: 'organization_id,tally_ledger_name' });

        if (!error) successCount++;
        else console.error('chart_account_tally insert error:', error.message);
      }
    }

    return NextResponse.json({ success: true, count: successCount });

  } catch (error: any) {
    console.error('Import JSON failed:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
