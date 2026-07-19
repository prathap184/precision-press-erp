#!/usr/bin/env node
export {};

/**
 * Supabase Initialization and Migration Script
 * 
 * This script:
 * 1. Validates Supabase connectivity and required tables
 * 2. Migrates data from Firestore to Supabase
 * 3. Validates the migration completion
 * 
 * NOTE: SQL schema must be applied separately via:
 * - Supabase Dashboard: https://app.supabase.com
 * - SQL Editor > Run migration: supabase/migrations/0001_initial_schema.sql
 * - Or: supabase db push (requires local setup with supabase link)
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
let FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error('❌ Missing Firebase admin credentials in .env.local');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase service role config in .env.local');
  process.exit(1);
}

if (FIREBASE_PRIVATE_KEY.startsWith('"') && FIREBASE_PRIVATE_KEY.endsWith('"')) {
  FIREBASE_PRIVATE_KEY = FIREBASE_PRIVATE_KEY.slice(1, -1);
}
FIREBASE_PRIVATE_KEY = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY,
  }),
});

const firestore = admin.firestore();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const MIGRATION_BATCH_SIZE = Number(process.env.SUPABASE_MIGRATION_BATCH_SIZE || 100);
const MIGRATION_RETRY_LIMIT = 3;
const MIGRATION_STATE_PATH = path.join(process.cwd(), '.supabase-migration-state.json');
const COLLECTION_MAPPINGS = [
  ['profiles', 'profiles'],
  ['categories', 'categories'],
  ['products', 'products'],
  ['orders', 'orders'],
  ['order_items', 'order_items'],
  ['payments', 'payments'],
  ['transactions', 'transactions'],
  ['cart', 'cart'],
  ['wishlist', 'wishlist'],
  ['tally_sync_queue', 'tally_sync_queue'],
  ['audit_logs', 'audit_logs'],
  ['audit_stats', 'audit_stats'],
  ['activity_logs', 'activity_logs'],
  ['jobs', 'jobs'],
  ['backup_designs', 'backup_designs'],
  ['designs', 'designs'],
];

function loadMigrationState() {
  try {
    if (!fs.existsSync(MIGRATION_STATE_PATH)) {
      return { completed: [], results: {} };
    }
    return JSON.parse(fs.readFileSync(MIGRATION_STATE_PATH, 'utf8'));
  } catch {
    return { completed: [], results: {} };
  }
}

function saveMigrationState(state) {
  fs.writeFileSync(MIGRATION_STATE_PATH, JSON.stringify(state, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt < MIGRATION_RETRY_LIMIT; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!(error && Number((error as any).code) === 8) || attempt === MIGRATION_RETRY_LIMIT - 1) {
        throw error;
      }
      await sleep((attempt + 1) * 1500);
    }
  }
  throw lastError;
}

console.log('🔄 Starting Supabase initialization and data migration...\n');

function normalizeValue(value: any): any {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    if (value.toDate && typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }
    const obj: any = {};
    for (const key of Object.keys(value)) {
      obj[key] = normalizeValue(value[key]);
    }
    return obj;
  }
  return value;
}

function normalizeDocument(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const normalized: any = {};
  for (const [key, value] of Object.entries(data)) {
    normalized[key] = normalizeValue(value);
  }
  return normalized;
}

async function checkTablesExist(): Promise<boolean> {
  console.log('🔍 Phase 1: Checking if Supabase tables exist...\n');
  
  const requiredTables = [
    'profiles',
    'categories',
    'products',
    'orders',
    'order_items',
  ];

  let allTablesExist = true;

  for (const table of requiredTables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.log(`   ❌ ${table}: NOT FOUND - ${error.message}`);
        allTablesExist = false;
      } else {
        console.log(`   ✅ ${table}: EXISTS`);
      }
    } catch (err: any) {
      console.log(`   ❌ ${table}: ERROR - ${err.message}`);
      allTablesExist = false;
    }
  }

  console.log();
  return allTablesExist;
}

async function upsertRows(table: string, rows: any[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error(`   ❌ Supabase upsert error for ${table}:`, error.message || error);
    throw error;
  }
  console.log(`   ✅ Upserted ${rows.length} rows into ${table}`);
}

async function fetchCollectionBatch(collectionName: string, startAfterDocId?: string) {
  let queryRef: any = firestore.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(MIGRATION_BATCH_SIZE);
  if (startAfterDocId) {
    queryRef = queryRef.startAfter(startAfterDocId);
  }
  return withRetry(() => queryRef.get());
}

async function migrateCollection(collectionName: string, tableName: string): Promise<number> {
  console.log(`   📦 Migrating ${collectionName} -> ${tableName}...`);
  let totalRows = 0;
  let lastDocId: string | undefined;

  while (true) {
    const snapshot = await fetchCollectionBatch(collectionName, lastDocId);
    if (snapshot.empty) {
      break;
    }

    const rows = snapshot.docs.map((doc: any) => {
      const data = normalizeDocument(doc.data());
      return {
        id: doc.id,
        ...data,
      };
    });

    await upsertRows(tableName, rows);
    totalRows += rows.length;
    lastDocId = snapshot.docs[snapshot.docs.length - 1].id;

    if (snapshot.docs.length < MIGRATION_BATCH_SIZE) {
      break;
    }
  }

  if (totalRows === 0) {
    console.log(`      (empty collection)`);
    return 0;
  }

  console.log(`   ✅ Migrated ${totalRows} rows from ${collectionName}`);
  return totalRows;
}

async function migrateOrderItems(): Promise<number> {
  console.log(`   📦 Migrating order items from nested subcollections...`);
  const ordersSnapshot = await fetchCollectionBatch('orders');
  let total = 0;
  for (const orderDoc of ordersSnapshot.docs) {
    let lastItemId: string | undefined;
    while (true) {
      let subQuery: any = orderDoc.ref.collection('items').orderBy(admin.firestore.FieldPath.documentId()).limit(MIGRATION_BATCH_SIZE);
      if (lastItemId) {
        subQuery = subQuery.startAfter(lastItemId);
      }
      const subSnap = await withRetry(() => subQuery.get());
      if (subSnap.empty) {
        break;
      }

      const rows = subSnap.docs.map((itemDoc: any) => {
      const data = normalizeDocument(itemDoc.data());
      return {
        id: itemDoc.id,
        order_id: orderDoc.id,
        ...data,
      };
    });

      if (rows.length) {
        await upsertRows('order_items', rows);
        total += rows.length;
      }

      lastItemId = subSnap.docs[subSnap.docs.length - 1].id;
      if (subSnap.docs.length < MIGRATION_BATCH_SIZE) {
        break;
      }
    }
  }
  console.log(`   ✅ Migrated ${total} order items`);
  return total;
}

async function runDataMigration(): Promise<Array<{ collection: string; error: string }>> {
  console.log('🔄 Phase 2: Migrating data from Firestore to Supabase...\n');
  const state = loadMigrationState();
  state.completed = Array.isArray(state.completed) ? state.completed : [];
  state.results = state.results && typeof state.results === 'object' ? state.results : {};
  const completedSet = new Set(state.completed);
  const failures: Array<{ collection: string; error: string }> = [];

  for (const [collectionName, tableName] of COLLECTION_MAPPINGS) {
    if (completedSet.has(collectionName)) {
      console.log(`   ↩️  Skipping ${collectionName} (already completed in a prior run)`);
      continue;
    }

    try {
      const migratedRows = collectionName === 'order_items'
        ? await migrateOrderItems()
        : await migrateCollection(collectionName, tableName);
      completedSet.add(collectionName);
      state.completed = Array.from(completedSet);
      state.results[collectionName] = { rowsMigrated: migratedRows };
      saveMigrationState(state);
      console.log(`   ✅ Collection complete: ${collectionName} (${migratedRows} rows)`);
    } catch (error: any) {
      const message = error?.message || String(error);
      failures.push({ collection: collectionName, error: message });
      state.results[collectionName] = { error: message };
      saveMigrationState(state);
      console.log(`   ⚠️  Collection failed: ${collectionName} (${message})`);
      continue;
    }
  }

  console.log('\n✅ Data migration pass finished.');
  if (failures.length) {
    console.log('⚠️  Some collections still need another retry pass:');
    for (const failure of failures) {
      console.log(`   - ${failure.collection}: ${failure.error}`);
    }
  }

  return failures;
}

async function validateMigration(): Promise<void> {
  console.log('\n🔍 Phase 3: Validating migration results...\n');
  
  const tablesToCheck = [
    'profiles',
    'categories',
    'products',
    'orders',
    'order_items',
    'payments',
    'transactions',
    'cart',
    'wishlist',
    'tally_sync_queue',
    'audit_logs',
    'audit_stats',
    'activity_logs',
    'jobs',
    'backup_designs',
    'designs',
  ];

  let successCount = 0;
  let skipCount = 0;

  for (const table of tablesToCheck) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.warn(`   ⚠️  ${table}: ${error.message}`);
      skipCount++;
    } else {
      console.log(`   ✅ ${table}: ${count || 0} rows`);
      successCount++;
    }
  }
  
  console.log(`\n   Summary: ${successCount}/${tablesToCheck.length} tables validated\n`);
}

async function run(): Promise<void> {
  try {
    const tablesExist = await checkTablesExist();
    
    if (!tablesExist) {
      console.log('⚠️  IMPORTANT: Supabase tables not found!\n');
      console.log('   To create the required tables, please:');
      console.log('   1. Go to: https://app.supabase.com');
      console.log('   2. Select your project: "press-523e2"');
      console.log('   3. Click "SQL Editor" in the left sidebar');
      console.log('   4. Click "New query"');
      console.log('   5. Copy and paste the contents of: supabase/migrations/0001_initial_schema.sql');
      console.log('   6. Click "Run"');
      console.log('   7. Run this script again\n');
      console.log('   Alternatively, use the Supabase CLI:');
      console.log('   $ supabase link --project-ref arffwmwpimdmhgmylpzi');
      console.log('   $ supabase db push\n');
      process.exit(1);
    }

    const failures = await runDataMigration();
    await validateMigration();
    if (failures.length) {
      console.error(`❌ Supabase initialization finished with ${failures.length} collection failures.\n`);
      process.exit(1);
    }

    console.log('🎉 Supabase initialization and migration completed successfully!\n');
    console.log('ℹ️  Next steps:');
    console.log('   1. Review data integrity in each table');
    console.log('   2. Verify app flows against Supabase runtime');
    console.log('   3. Monitor logs for consistency issues\n');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

run();

