const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('transactions').select('timestamp').gte('timestamp', '"2026-07-21T00:00:00Z"').limit(1).then(res => console.log('res:', JSON.stringify(res, null, 2)));
