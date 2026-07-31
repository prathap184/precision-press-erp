const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseDirect = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const { data, error } = await supabaseDirect.from('contact').select('id, uid, name').limit(10);
  console.log(data);
}
check();
