const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://40.81.236.61',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function cleanSpacePhones() {
  const { data: contacts } = await supabase
    .from('contact')
    .select('id, name, billing_address_line1, phone')
    .is('phone', null);

  console.log(`Checking ${contacts.length} contacts with null phone...`);

  let fixed = 0;
  for (const c of contacts) {
    if (!c.billing_address_line1) continue;
    // Match 10 digit numbers even if separated by space e.g. 98864 66266 or 98452 49303
    const digitsOnly = c.billing_address_line1.replace(/[^\d\s]/g, ' ');
    const phoneMatch = digitsOnly.match(/\b([6-9]\d{4}\s*\d{5})\b/) || digitsOnly.match(/\b([6-9]\d{9})\b/);
    if (phoneMatch) {
      const cleanPhone = phoneMatch[0].replace(/\s+/g, '');
      if (cleanPhone.length === 10) {
        await supabase.from('contact').update({ phone: cleanPhone }).eq('id', c.id);
        fixed++;
      }
    }
  }

  console.log(`Extracted and populated ${fixed} more phone numbers!`);
}

cleanSpacePhones().catch(console.error);
