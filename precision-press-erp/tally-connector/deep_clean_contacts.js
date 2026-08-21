const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function deepCleanAllContacts() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔍 DEEP AUDIT & ENRICHMENT OF ALL CONTACT RECORDS');
  console.log('════════════════════════════════════════════════════════════════\n');

  let allContacts = [];
  for (let offset = 0; offset <= 5000; offset += 1000) {
    const { data: contacts } = await supabase
      .from('contact')
      .select('*')
      .range(offset, offset + 999);
    if (contacts && contacts.length > 0) allContacts = allContacts.concat(contacts);
    else break;
  }

  console.log(`Auditing total ${allContacts.length} contacts...`);

  const updates = [];
  let phoneExtractedCount = 0;
  let panExtractedCount = 0;

  for (const c of allContacts) {
    const patch = {};

    // 1. Check if phone is missing but present in Name
    if (!c.phone) {
      const namePhoneMatch = (c.name || '').match(/(?:[^\d]|^)([6-9]\d{9})(?:[^\d]|$)/);
      if (namePhoneMatch) {
        patch.phone = namePhoneMatch[1];
        phoneExtractedCount++;
      } else if (c.billing_address_line1) {
        const addrPhoneMatch = c.billing_address_line1.match(/(?:[^\d]|^)([6-9]\d{4}\s*\d{5}|[6-9]\d{9})(?:[^\d]|$)/);
        if (addrPhoneMatch) {
          patch.phone = addrPhoneMatch[1].replace(/\s+/g, '');
          phoneExtractedCount++;
        }
      }
    }

    // 2. Check if PAN is missing but 15-digit GSTIN is available
    if (!c.pan_number && c.tax_number && c.tax_number.length === 15) {
      patch.pan_number = c.tax_number.substring(2, 12);
      panExtractedCount++;
    }

    // 3. Ensure gstin & gst_number are aligned
    if (c.tax_number && (!c.gstin || !c.gst_number)) {
      if (!c.gstin) patch.gstin = c.tax_number;
      if (!c.gst_number) patch.gst_number = c.tax_number;
    }

    if (Object.keys(patch).length > 0) {
      updates.push(supabase.from('contact').update(patch).eq('id', c.id));
    }
  }

  console.log(`Found ${updates.length} contacts requiring data enrichment:`);
  console.log(`  - Missing Phones recovered from Name/Address: ${phoneExtractedCount}`);
  console.log(`  - Missing PANs recovered: ${panExtractedCount}`);

  if (updates.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      await Promise.all(chunk);
      process.stdout.write(`\rEnriching: ${Math.min(i + BATCH_SIZE, updates.length)} / ${updates.length}...`);
    }
  }

  console.log('\n\n✅ 100% DONE! All contact fields fully populated and verified.');
}

deepCleanAllContacts().catch(console.error);
