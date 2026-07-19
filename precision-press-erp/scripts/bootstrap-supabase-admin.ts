export {};

import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const DEFAULT_EMAIL = 'jpratap731@gmail.com';
const DEFAULT_PASSWORD = 'TempAdmin@12345!';

function getClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findOrCreateAuthUser(client: any, email: string, password: string) {
  const { data: listData, error: listError } = await client.auth.admin.listUsers();
  if (listError) {
    throw listError;
  }

  const existing = listData.users.find((entry: any) => entry.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { error: updateError } = await client.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
      },
    });

    if (updateError) {
      throw updateError;
    }

    return existing;
  }

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

async function main() {
  const email = process.env.SUPABASE_BOOTSTRAP_ADMIN_EMAIL || DEFAULT_EMAIL;
  const password = process.env.SUPABASE_BOOTSTRAP_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const client = getClient();

  const user = await findOrCreateAuthUser(client, email, password);
  if (!user) {
    throw new Error('Unable to create or load the bootstrap admin user');
  }

  const profile = {
    id: user.id,
    email,
    name: 'Super Admin',
    displayName: 'Super Admin',
    role: 'SUPER_ADMIN',
    roles: ['SUPER_ADMIN'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { error } = await client.from('profiles').upsert(profile, { onConflict: 'id' });
  if (error) {
    throw error;
  }

  console.log('Bootstrap admin ready');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;

if (isMain) {
  main().catch((error) => {
    console.error('Bootstrap admin failed:', error);
    process.exitCode = 1;
  });
}