const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error(error);
    return;
  }
  const users = data.users.filter(u => u.email.includes('ram'));
  console.log('Users in Auth:', JSON.stringify(users.map(u => ({ id: u.id, email: u.email })), null, 2));
}

test();
