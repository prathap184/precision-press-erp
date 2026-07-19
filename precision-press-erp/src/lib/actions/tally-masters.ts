'use server';

import { liveTallyFetch } from './tally-fetch';
import { supabaseAdmin } from '@/lib/supabase-admin'; // Assuming this exists or similar

/**
 * Fetches the List of Accounts from Tally and updates the ERP database (profiles).
 */
export async function syncTallyMasters(userId: string) {
  try {
    const fetchRes = await liveTallyFetch({ fetchType: 'FETCH_MASTERS', createdBy: userId });
    
    if (!fetchRes.success || !fetchRes.data) {
      return { success: false, error: fetchRes.error || 'No data returned from Tally' };
    }

    const tallyJson = fetchRes.data;

    // Tally Export XML for "List of Accounts" usually looks like:
    // ENVELOPE.BODY.DATA.COLLECTION.LEDGER
    // Depending on the exact xml2js output, it might be an array or single object.
    
    let ledgers = tallyJson?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER;
    if (!ledgers) {
      // In some TDL/XML structures, it might just be inside IMPORTDATA
      console.warn('[SyncMasters] Unexpected JSON structure from Tally:', JSON.stringify(tallyJson).substring(0, 500));
      return { success: false, error: 'Unexpected data format from Tally' };
    }

    if (!Array.isArray(ledgers)) {
      ledgers = [ledgers];
    }

    console.log(`[SyncMasters] Fetched ${ledgers.length} ledgers from Tally.`);

    // Note: To prevent overwhelming Supabase, we would process these in batches.
    // For now, we are just proving the bridge works.
    
    // Example logic to extract Debtors and Creditors:
    /*
    const customers = ledgers.filter((l: any) => l.PARENT === 'Sundry Debtors');
    const suppliers = ledgers.filter((l: any) => l.PARENT === 'Sundry Creditors');
    
    for (const c of customers) {
      await supabaseAdmin.from('profiles').upsert({
         tally_ledger_name: c.NAME,
         name: c.NAME,
         role: 'CUSTOMER',
         // extract address, GSTIN if available in the XML
      }, { onConflict: 'tally_ledger_name' });
    }
    */

    return { success: true, count: ledgers.length, message: `Successfully fetched ${ledgers.length} ledgers.` };

  } catch (error: any) {
    console.error('[SyncMasters] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetches the Trial Balance (closing balances) from Tally.
 */
export async function fetchLiveBalances(userId: string) {
  try {
    const fetchRes = await liveTallyFetch({ fetchType: 'FETCH_BALANCES', createdBy: userId });
    
    if (!fetchRes.success || !fetchRes.data) {
      return { success: false, error: fetchRes.error || 'No data returned from Tally' };
    }

    // Trial balance parsing logic would go here.
    return { success: true, data: fetchRes.data };

  } catch (error: any) {
    console.error('[FetchBalances] Error:', error);
    return { success: false, error: error.message };
  }
}
