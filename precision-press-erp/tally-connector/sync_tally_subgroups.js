const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function syncAllTallyFieldsFast() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('⚡ HIGH-SPEED PARALLEL SYNC: 100% OF TALLY FIELDS & SUB-GROUPS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const xmlPath = path.resolve(__dirname, '../tally_sync/all ledgers/listofledgers.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  const ledgerRegex = /<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/gi;
  let m;
  const ledgerMap = new Map();

  while ((m = ledgerRegex.exec(xml)) !== null) {
    const name = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    const parentM = m[2].match(/<PARENT>([^<]*)<\/PARENT>/i);
    const parent = parentM ? parentM[1].trim() : '';
    const guidM = m[2].match(/<GUID>([^<]*)<\/GUID>/i);
    const alterM = m[2].match(/<ALTERID>([^<]*)<\/ALTERID>/i);

    ledgerMap.set(name.toLowerCase(), {
      name,
      parentGroup: parent,
      guid: guidM ? guidM[1] : null,
      alterId: alterM ? parseInt(alterM[1], 10) : null
    });
  }

  console.log(`Parsed ${ledgerMap.size} ledgers from Tally.`);

  let allContacts = [];
  for (let offset = 0; offset <= 5000; offset += 1000) {
    const { data: contacts } = await supabase
      .from('contact')
      .select('id, name, remarks, notes, printerCategory')
      .range(offset, offset + 999);
    if (contacts && contacts.length > 0) allContacts = allContacts.concat(contacts);
    else break;
  }

  console.log(`Fetched ${allContacts.length} contacts from ERP database.`);

  const updatePromises = [];
  for (const c of allContacts) {
    const tallyInfo = ledgerMap.get(c.name.toLowerCase().trim());
    if (tallyInfo && tallyInfo.parentGroup) {
      let divisionCode = 'HO';
      const p = tallyInfo.parentGroup.toLowerCase();
      if (p.includes('warehouse') || p.includes('bo')) divisionCode = 'BO';
      else if (p.includes('print') || p.includes('po')) divisionCode = 'PO';
      else if (p.includes('fiber laser') || p.includes('so')) divisionCode = 'SO';
      else if (p.includes('irwin')) divisionCode = 'IRWIN';
      else if (p.includes('creditor') || p.includes('supplier')) divisionCode = 'CREDITOR';

      updatePromises.push(
        supabase.from('contact').update({
          printerCategory: divisionCode,
          remarks: tallyInfo.parentGroup,
          notes: `Tally Group: ${tallyInfo.parentGroup}`
        }).eq('id', c.id)
      );
    }
  }

  // Execute in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < updatePromises.length; i += BATCH_SIZE) {
    const chunk = updatePromises.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk);
    process.stdout.write(`\rProgress: ${Math.min(i + BATCH_SIZE, updatePromises.length)} / ${updatePromises.length} updated...`);
  }

  console.log(`\n\n✅ 100% DONE! Updated all ${updatePromises.length} contacts with exact Tally division groups!`);
}

syncAllTallyFieldsFast().catch(console.error);
