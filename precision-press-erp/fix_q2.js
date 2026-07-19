const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  await supabase.from('profiles').insert([{ 
    id: '6f6f2ff3-3fd7-4bd1-8c94-0a2dffe3cd9c', 
    uid: '6f6f2ff3-3fd7-4bd1-8c94-0a2dffe3cd9c', 
    email: 'ram@gmail.com', 
    name: 'ram' 
  }]);

  const { error } = await supabase
    .from('quotations')
    .update({ customer_id: '6f6f2ff3-3fd7-4bd1-8c94-0a2dffe3cd9c' })
    .eq('quotation_number', 'QT-1784121564790');

  if (error) console.error(error);
  else console.log('Quotation customer ID fixed!');
}

test();
