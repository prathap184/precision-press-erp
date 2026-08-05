export {};

import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);

require('dotenv').config({ path: '.env.local' });
try {
  globalThis.WebSocket = require('ws');
} catch {}
const { createClient } = require('@supabase/supabase-js');

function mask(value: string | undefined) {
  if (!value) return 'MISSING';
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

async function testClient(name: string, url: string | undefined, key: string | undefined) {
  if (!url || !key) {
    console.error(`${name}: missing URL or key`);
    return;
  }
  console.log(`${name}: url=${url}`);
  console.log(`${name}: key=${mask(key)}`);

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { log_level: "silent" }
  });
  const { data, error } = await client.from('profiles').select('*').limit(1);
  if (error) {
    console.error(`${name} query error:`, error.message || error);
    return;
  }
  console.log(`${name} query success:`, data);
}

async function test() {
  try {
    await testClient('ANON', process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    await testClient('SERVICE', process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } catch (err) {
    console.error('Supabase validation failed:', err);
    process.exitCode = 3;
  }
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;

if (isMain) test();
