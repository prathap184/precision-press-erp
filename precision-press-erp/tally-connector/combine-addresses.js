/**
 * Combine billing_address_line1 and billing_address_line2 into billing_address_line1
 * and set billing_address_line2 to null.
 */
'use strict';

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000002';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function combineAddresses() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔄 COMBINING ADDRESSES INTO SINGLE LINE 1 (TALLY STYLE)');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Fetch all contacts with non-null line 2
  let allContacts = [];
  for (let offset = 0; offset <= 4000; offset += 1000) {
    const { data } = await supabase
      .from('contact')
      .select('id, name, billing_address_line1, billing_address_line2')
      .eq('organization_id', DEFAULT_ORG_ID)
      .not('billing_address_line2', 'is', null)
      .range(offset, offset + 999);

    if (data && data.length > 0) {
      allContacts = allContacts.concat(data);
    } else {
      break;
    }
  }

  console.log(`Found ${allContacts.length} contacts with data in Line 2.`);

  let updatedCount = 0;

  for (const c of allContacts) {
    const line1 = (c.billing_address_line1 || '').trim();
    const line2 = (c.billing_address_line2 || '').trim();

    if (!line2) continue;

    let combined = '';
    if (line1 && line2) {
      // Avoid duplicate commas
      combined = line1.endsWith(',') ? `${line1} ${line2}` : `${line1}, ${line2}`;
    } else {
      combined = line1 || line2;
    }

    const { error } = await supabase
      .from('contact')
      .update({
        billing_address_line1: combined,
        billing_address_line2: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', c.id);

    if (!error) {
      updatedCount++;
      if (updatedCount % 50 === 0) {
        process.stdout.write(`   ✓ Combined ${updatedCount}/${allContacts.length} addresses...\r`);
      }
    }
  }

  // Also update contact_tally staging table for consistency
  let stagingContacts = [];
  for (let offset = 0; offset <= 4000; offset += 1000) {
    const { data } = await supabase
      .from('contact_tally')
      .select('staging_id, billing_address_line1, billing_address_line2')
      .eq('organization_id', DEFAULT_ORG_ID)
      .not('billing_address_line2', 'is', null)
      .range(offset, offset + 999);

    if (data && data.length > 0) {
      stagingContacts = stagingContacts.concat(data);
    } else {
      break;
    }
  }

  for (const st of stagingContacts) {
    const l1 = (st.billing_address_line1 || '').trim();
    const l2 = (st.billing_address_line2 || '').trim();
    if (!l2) continue;

    const combinedSt = l1 && l2 ? (l1.endsWith(',') ? `${l1} ${l2}` : `${l1}, ${l2}`) : (l1 || l2);
    await supabase
      .from('contact_tally')
      .update({
        billing_address_line1: combinedSt,
        billing_address_line2: null
      })
      .eq('staging_id', st.staging_id);
  }

  console.log(`\n\n✅ SUCCESS! Combined ${updatedCount} customer addresses into billing_address_line1!`);
  console.log('   billing_address_line2 is now set to NULL across all records.\n');
}

combineAddresses().catch(console.error);
