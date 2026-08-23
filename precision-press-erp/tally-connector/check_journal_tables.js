const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/)[1];
const SUPABASE_KEY = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)[1];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkTables() {
  const { data: je, error: e1 } = await supabase.from('journal_entry').select('id, description');
  const { data: jl, error: e2 } = await supabase.from('journal_line').select('id');
  const { data: jel, error: e3 } = await supabase.from('journal_entry_line').select('id');
  const { data: act, error: e4 } = await supabase.from('activity_logs').select('id');

  console.log('journal_entry count:', je ? je.length : (e1 ? e1.message : 'null'));
  console.log('journal_line count:', jl ? jl.length : (e2 ? e2.message : 'null'));
  console.log('journal_entry_line count:', jel ? jel.length : (e3 ? e3.message : 'null'));
  console.log('activity_logs count:', act ? act.length : (e4 ? e4.message : 'null'));
}

checkTables();
