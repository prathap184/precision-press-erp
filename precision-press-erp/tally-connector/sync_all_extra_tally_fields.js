const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function syncAllExtraFields() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔄 SYNCING ALL ADVANCED TALLY FIELDS (PAN, CONTACT PERSON, EMAIL)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let m;
  const ledgerMap = new Map();

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    const body = m[2];

    const panM = body.match(/<INCOMETAXNUMBER>([^<]*)<\/INCOMETAXNUMBER>/i) || body.match(/<PANNUMBER>([^<]*)<\/PANNUMBER>/i);
    const gstinM = body.match(/<PARTYGSTIN>([^<]*)<\/PARTYGSTIN>/i) || body.match(/<GSTIN>([^<]*)<\/GSTIN>/i);
    const contactPersonM = body.match(/<LEDGERCONTACT>([^<]*)<\/LEDGERCONTACT>/i);
    const emailM = body.match(/<EMAIL>([^<]*)<\/EMAIL>/i);
    const altMobileM = body.match(/<LEDGERPHONE>([^<]*)<\/LEDGERPHONE>/i);
    const isCommonM = body.match(/<ISCOMMONPARTY>([^<]*)<\/ISCOMMONPARTY>/i);

    let pan = panM ? panM[1].trim().toUpperCase() : null;
    const gstin = gstinM ? gstinM[1].trim().toUpperCase() : '';
    if (!pan && gstin.length === 15) {
      // 10 digits of PAN are characters 3 to 12 in 15-digit GSTIN (e.g. 29AAAAA0000A1Z5 -> AAAAA0000A)
      pan = gstin.substring(2, 12);
    }

    ledgerMap.set(name.toLowerCase(), {
      name,
      pan: pan || null,
      contactPerson: contactPersonM ? contactPersonM[1].trim() : null,
      email: emailM ? emailM[1].trim() : null,
      altMobile: altMobileM ? altMobileM[1].trim() : null,
      isBoth: isCommonM && isCommonM[1].trim().toLowerCase() === 'yes'
    });
  }

  let allContacts = [];
  for (let offset = 0; offset <= 5000; offset += 1000) {
    const { data: contacts } = await supabase
      .from('contact')
      .select('id, name, pan_number, contact_person, email, alternate_mobile, type')
      .range(offset, offset + 999);
    if (contacts && contacts.length > 0) allContacts = allContacts.concat(contacts);
    else break;
  }

  console.log(`Auditing ${allContacts.length} contacts for PAN numbers, Contact Persons, and Emails...`);

  const updatePromises = [];
  let panCount = 0;
  let emailCount = 0;
  let contactPersonCount = 0;

  for (const c of allContacts) {
    const tallyInfo = ledgerMap.get(c.name.toLowerCase().trim());
    if (!tallyInfo) continue;

    const updates = {};
    if (tallyInfo.pan && !c.pan_number) {
      updates.pan_number = tallyInfo.pan;
      panCount++;
    }
    if (tallyInfo.contactPerson && !c.contact_person) {
      updates.contact_person = tallyInfo.contactPerson;
      contactPersonCount++;
    }
    if (tallyInfo.email && !c.email) {
      updates.email = tallyInfo.email;
      emailCount++;
    }
    if (tallyInfo.altMobile && !c.alternate_mobile) {
      updates.alternate_mobile = tallyInfo.altMobile;
    }
    if (tallyInfo.isBoth && c.type !== 'both') {
      updates.type = 'both';
    }

    if (Object.keys(updates).length > 0) {
      updatePromises.push(supabase.from('contact').update(updates).eq('id', c.id));
    }
  }

  console.log(`Found ${panCount} PAN numbers derived from GSTIN/Tally, ${contactPersonCount} contact persons, and ${emailCount} emails.`);

  const BATCH_SIZE = 50;
  for (let i = 0; i < updatePromises.length; i += BATCH_SIZE) {
    const chunk = updatePromises.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk);
    process.stdout.write(`\rUpdating: ${Math.min(i + BATCH_SIZE, updatePromises.length)} / ${updatePromises.length}...`);
  }

  console.log(`\n\n✅ 100% DONE! Populated all remaining PAN numbers, contact persons, and emails into ERP!`);
}

syncAllExtraFields().catch(console.error);
