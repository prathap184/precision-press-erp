require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAccess() {
  console.log('Testing access with ANON key...');
  const { data, error } = await supabase.from('workflow_departments').select('*');
  if (error) {
    console.error('Error fetching with ANON key:', error);
  } else {
    console.log(`Fetched ${data?.length || 0} departments with ANON key.`);
    if (data?.length === 0) {
      console.log('Data is empty for ANON key. RLS is likely blocking read access.');
    } else {
      console.log('ANON key CAN read the data.');
    }
  }
}

checkAccess();
