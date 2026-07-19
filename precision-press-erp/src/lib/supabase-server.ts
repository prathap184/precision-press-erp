import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let __supabaseClient: ReturnType<typeof createClient> | null = null;
function initSupabase() {
  if (!__supabaseClient) {
    __supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return __supabaseClient;
}

const handler: ProxyHandler<any> = {
  get(_target, prop) {
    const client = initSupabase();
    const value = (client as any)[prop];
    if (typeof value === 'function') return value.bind(client);
    return value;
  },
  apply(_target, _thisArg, args) {
    const client = initSupabase();
    return (client as any).apply(_thisArg, args);
  }
};

// Lazy-initialized supabase server proxy so module import has no side-effects
export const supabaseServer = new Proxy(function () {}, handler) as unknown as ReturnType<typeof createClient>;

export default supabaseServer;
