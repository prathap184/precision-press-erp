const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase.from('profiles').select('id, uid, email, name, role').ilike('email', '%ram%');
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}

test();
