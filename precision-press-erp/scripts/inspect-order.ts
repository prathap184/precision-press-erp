import { createClient } from '@supabase/supabase-js';

const orderId = process.argv[2] || 'ORD-037063';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
  try {
    const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (error) {
      console.error('Fetch error:', error);
      process.exit(1);
    }
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  } catch (err: any) {
    console.error('Unexpected error:', err.message || err);
    process.exit(2);
  }
})();
