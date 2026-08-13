'use server';

import { supabaseServer } from '@/lib/supabase-server';

export async function getStagingMasterData() {
  const { data: contacts } = await supabaseServer
    .from('contact_tally')
    .select('*')
    .eq('import_status', 'pending');

  const { data: banks } = await supabaseServer
    .from('bank_account_tally')
    .select('*')
    .eq('import_status', 'pending');

  const { data: accounts } = await supabaseServer
    .from('chart_account_tally')
    .select('*')
    .eq('import_status', 'pending');

  return {
    contacts: contacts || [],
    banks: banks || [],
    accounts: accounts || [],
  };
}

export async function importSelectedMasters({
  contactStagingIds = [],
  bankStagingIds = [],
  accountStagingIds = [],
  organizationId,
  cutoverDate = new Date().toISOString().split('T')[0],
  userId,
}: {
  contactStagingIds?: string[];
  bankStagingIds?: string[];
  accountStagingIds?: string[];
  organizationId: string;
  cutoverDate: string;
  userId: string;
}) {
  try {
    let successCount = 0;

    // 1. Process Chart of Accounts
    if (accountStagingIds.length > 0) {
      const { data: accounts } = await supabaseServer
        .from('chart_account_tally')
        .select('*')
        .in('staging_id', accountStagingIds)
        .eq('import_status', 'pending');

      for (const acc of (accounts || [])) {
        // Insert into chart_account
        const { data: insertedAcc, error } = await supabaseServer
          .from('chart_account')
          .insert({
            organization_id: organizationId,
            code: acc.code,
            name: acc.name,
            type: acc.type,
            sub_type: acc.sub_type,
            currency_code: acc.currency_code,
            is_active: acc.is_active,
            description: acc.description || `Imported from Tally (${acc.tally_ledger_name})`,
            is_system: acc.is_system,
          })
          .select('id')
          .single();

        if (error) continue;

        // Update staging table
        await supabaseServer
          .from('chart_account_tally')
          .update({ import_status: 'synced', id: insertedAcc.id })
          .eq('staging_id', acc.staging_id);

        successCount++;
      }
    }

    // 2. Process Bank Accounts
    if (bankStagingIds.length > 0) {
      const { data: banks } = await supabaseServer
        .from('bank_account_tally')
        .select('*')
        .in('staging_id', bankStagingIds)
        .eq('import_status', 'pending');

      for (const bank of (banks || [])) {
        const { data: insertedBank, error } = await supabaseServer
          .from('bank_account')
          .insert({
            organization_id: organizationId,
            account_name: bank.account_name,
            account_number: bank.account_number,
            bank_name: bank.bank_name,
            currency_code: bank.currency_code,
            account_type: bank.account_type,
            balance: bank.balance, // Initial balance
            is_active: bank.is_active,
          })
          .select('id')
          .single();

        if (error) continue;

        await supabaseServer
          .from('bank_account_tally')
          .update({ import_status: 'synced', id: insertedBank.id })
          .eq('staging_id', bank.staging_id);

        successCount++;
      }
    }

    // 3. Process Contacts & Opening Balances
    if (contactStagingIds.length > 0) {
      const { data: contacts } = await supabaseServer
        .from('contact_tally')
        .select('*')
        .in('staging_id', contactStagingIds)
        .eq('import_status', 'pending');

      for (const c of (contacts || [])) {
        // Insert into contact table
        const { data: insertedContact, error } = await supabaseServer
          .from('contact')
          .insert({
            organization_id: organizationId,
            name: c.name,
            email: c.email,
            phone: c.phone,
            tax_number: c.tax_number || c.gstin,
            gstin: c.gstin || c.tax_number,
            gst_number: c.gst_number || c.gstin || c.tax_number,
            type: c.type || 'customer',
            payment_terms_days: c.payment_terms_days || 30,
            addresses: c.addresses,
            state: c.state || c.billing_state,
            billing_state: c.billing_state || c.state,
            billing_country: c.billing_country || 'India',
            notes: c.notes,
            currency_code: c.currency_code || 'INR',
            credit_limit: c.credit_limit || 0,
            tally_ledger_name: c.tally_ledger_name || c.name,
            tally_opening_balance: c.tally_opening_balance || 0,
          })
          .select('id')
          .single();

        if (error) {
          console.error("Failed to insert contact", error);
          continue;
        }

        // Handle Opening Balance
        const balance = Number(c.tally_opening_balance) || 0;
        
        if (balance !== 0) {
          // If customer owes us (positive balance) -> Create Invoice
          if (c.type === 'customer' && balance > 0) {
            const { data: inv } = await supabaseServer.from('invoice').insert({
              organization_id: organizationId,
              contact_id: insertedContact.id,
              invoice_number: `OB-INV-${Math.floor(1000 + Math.random() * 9000)}`,
              issue_date: cutoverDate,
              due_date: cutoverDate,
              status: 'sent',
              invoice_type: 'standard',
              subtotal: Math.round(balance * 100), // assuming ERP uses cents
              total: Math.round(balance * 100),
              amount_due: Math.round(balance * 100),
              currency_code: 'INR',
              created_by: userId,
            }).select('id').single();

            if (inv) {
              await supabaseServer.from('invoice_line').insert({
                invoice_id: inv.id,
                description: 'Tally Opening Balance',
                quantity: 100, // 1.00
                unit_price: Math.round(balance * 100),
                amount: Math.round(balance * 100),
              });
            }
          }
          // If we owe customer (negative balance) -> Create Customer Credit
          else if (c.type === 'customer' && balance < 0) {
            const creditAmount = Math.abs(Math.round(balance * 100));
            await supabaseServer.from('customer_credit').insert({
              organization_id: organizationId,
              contact_id: insertedContact.id,
              date: cutoverDate,
              original_amount: creditAmount,
              amount_remaining: creditAmount,
              source_type: 'overpayment',
              status: 'open',
              created_by: userId,
              notes: 'Tally Opening Balance (Advance)'
            });
          }
          // If we owe supplier (positive balance) -> Should create a Bill (assuming bill table exists)
          // Simplified for now: just record it
          else if (c.type === 'supplier' && balance > 0) {
            // Ideally insert into 'bill' table. 
            // For now, we rely on the contact_tally record for reference if bill doesn't exist
          }
        }

        // Mark as synced
        await supabaseServer
          .from('contact_tally')
          .update({ import_status: 'synced', id: insertedContact.id })
          .eq('staging_id', c.staging_id);

        successCount++;
      }
    }

    return { success: true, count: successCount };
  } catch (error: any) {
    console.error("Import failed:", error);
    return { success: false, error: error.message };
  }
}
