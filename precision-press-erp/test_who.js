const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', '6f6f2ff3-3fd7-4bd1-8c94-0a2dffe3cd9c');
  if (error) {
    console.error(error);
    return;
  }
  console.log('Profile for 6f6f:', JSON.stringify(data, null, 2));

  const { data: d2 } = await supabase.auth.admin.getUserById('6f6f2ff3-3fd7-4bd1-8c94-0a2dffe3cd9c');
  console.log('Auth user for 6f6f:', JSON.stringify(d2, null, 2));
}

test();
