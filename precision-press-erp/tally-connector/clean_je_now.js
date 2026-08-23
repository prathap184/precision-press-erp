const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function deleteRemainingJournalEntries() {
  console.log('🧹 Deleting remaining test journal entries from database...');
  const { data, error } = await supabase
    .from('journal_entry')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Delete error:', error.message);
  } else {
    console.log('✅ Successfully deleted all test journal entries!');
  }
}

deleteRemainingJournalEntries();
