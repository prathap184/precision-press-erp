/**
 * Usage:
 * npx ts-node scripts/set-user-role.ts <uid> <role>
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

import { supabaseServer } from '../src/lib/supabase-server';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const uid = process.argv[2];
const role = process.argv[3];

const allowedRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'DESIGNER',
  'PRINTER',
  'DISPATCH',
  'CUSTOMER',
];

if (!uid || !role) {
  console.log('Usage: npx ts-node scripts/set-user-role.ts <uid> <role>');
  process.exit(1);
}

if (!allowedRoles.includes(role)) {
  console.error(`Invalid role. Allowed roles: ${allowedRoles.join(', ')}`);
  process.exit(1);
}

async function setRole() {
  try {
    const timestamp = new Date().toISOString();

    const { error: profileError } = await supabaseServer
      .from('profiles')
      .upsert({ id: uid, role, roles: [role], updatedAt: timestamp }, { onConflict: 'id' });

    if (profileError) {
      throw profileError;
    }

    const { error: userError } = await supabaseServer
      .from('users')
      .upsert({ id: uid, role, updatedAt: timestamp }, { onConflict: 'id' });

    if (userError) {
      throw userError;
    }

    console.log(`Successfully set role ${role} for user ${uid}`);
    process.exit(0);
  } catch (error) {
    console.error('Error setting role:', error);
    process.exit(1);
  }
}

setRole();