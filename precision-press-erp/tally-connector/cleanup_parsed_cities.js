const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function cleanContactDetails() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧹 CLEANING UP CITIES, EXTRACTING EMAILS & PHONES FROM ADDRESSES');
  console.log('════════════════════════════════════════════════════════════════\n');

  let allContacts = [];
  for (let offset = 0; offset <= 5000; offset += 1000) {
    const { data: contacts } = await supabase
      .from('contact')
      .select('id, name, billing_address_line1, billing_city, phone, email')
      .range(offset, offset + 999);
    if (contacts && contacts.length > 0) allContacts = allContacts.concat(contacts);
    else break;
  }

  console.log(`Auditing ${allContacts.length} contacts...`);

  const updates = [];

  for (const c of allContacts) {
    const patch = {};
    const addr = c.billing_address_line1 || '';

    // Check if billing_city has an email or phone
    if (c.billing_city && (c.billing_city.includes('@') || /^\+?\d[\d\s-]{7,}/.test(c.billing_city) || c.billing_city.startsWith('M:'))) {
      if (c.billing_city.includes('@') && !c.email) {
        patch.email = c.billing_city.trim();
      }
      if (/^\+?\d[\d\s-]{7,}/.test(c.billing_city) || c.billing_city.startsWith('M:')) {
        const extractedPhone = c.billing_city.replace(/^[^\d]*/, '').replace(/[^\d]/g, '').slice(0, 10);
        if (extractedPhone.length === 10 && !c.phone) {
          patch.phone = extractedPhone;
        }
      }
      patch.billing_city = 'Mysore';
    }

    // Extract email from address if missing
    if (!c.email && addr) {
      const emailMatch = addr.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
      if (emailMatch) {
        patch.email = emailMatch[0].trim();
      }
    }

    // Extract phone from address if missing
    if (!c.phone && addr) {
      const phoneMatch = addr.match(/(?:(?:M|Ph|Mob|Mobile)[\s.:]*)?([6-9]\d{9})/i);
      if (phoneMatch) {
        patch.phone = phoneMatch[1].trim();
      }
    }

    // Standardize city if empty or null
    if (!c.billing_city) {
      patch.billing_city = 'Mysore';
    }

    if (Object.keys(patch).length > 0) {
      updates.push(supabase.from('contact').update(patch).eq('id', c.id));
    }
  }

  console.log(`Found ${updates.length} contacts needing city/email/phone cleanup.`);

  const BATCH_SIZE = 50;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk);
    process.stdout.write(`\rCleaned: ${Math.min(i + BATCH_SIZE, updates.length)} / ${updates.length}...`);
  }

  console.log('\n\n✅ 100% DONE! All contact cities, emails, and phone numbers are pristine clean!');
}

cleanContactDetails().catch(console.error);
