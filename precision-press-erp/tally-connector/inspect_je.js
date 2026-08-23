const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectJournalEntries() {
  const { data, error } = await supabase
    .from('journal_entry')
    .select('id, entry_number, description, source_type, deleted_at');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Remaining journal_entry records in DB: ${data.length}`);
  console.log(JSON.stringify(data, null, 2));
}

inspectJournalEntries();
