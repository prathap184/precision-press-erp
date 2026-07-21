import { getOrSetCache } from './cache';
import { CACHE_KEYS, CACHE_TTL } from './constants';
import { adminDb } from '@/lib/firebase-admin';
import { ALL_STAFF_ROLES } from '@/types/roles';
import { COMPANY_DETAILS } from '@/lib/company-config';

// Fallback hardcoded defaults if DB is empty
const DEFAULT_CATEGORIES = [
  { id: 'SOLVENT', name: 'Solvent Print', img: '/images/categories/solvent.png', color: 'from-blue-600/20 to-blue-900/20' },
  { id: 'ECO_SOLVENT', name: 'Eco Solvent', img: '/images/categories/eco-solvent.png', color: 'from-emerald-600/20 to-emerald-900/20' },
  { id: 'UV_ROLL', name: 'UV Roll', img: '/images/categories/uv-roll.png', color: 'from-indigo-600/20 to-indigo-900/20' },
  { id: 'UV_FLAT', name: 'UV Flat', img: '/images/categories/uv-flat.png', color: 'from-purple-600/20 to-purple-900/20' },
  { id: 'DIGITAL', name: 'Digital Print', img: '/images/categories/digital.png', color: 'from-amber-600/20 to-amber-900/20' },
  { id: 'ID_CARDS', name: 'ID Cards', img: '/images/categories/id-cards.png', color: 'from-rose-600/20 to-rose-900/20' }
];

const DEFAULT_GST = {
  defaultRate: 0.18,
  cgstLedgerName: 'Output CGST',
  sgstLedgerName: 'Output SGST',
  igstLedgerName: 'Output IGST',
};

const DEFAULT_DELIVERY = {
  door: 0,
  courier: 0,
  transport: 0,
  selfPickup: 0
};

// --- GETTERS ---

export async function getCachedCategories() {
  return getOrSetCache(
    CACHE_KEYS.CATEGORIES,
    async () => {
      const snap = await adminDb.collection('settings').doc('categories').get();
      if (!snap.exists) return DEFAULT_CATEGORIES;
      return snap.data()?.list || DEFAULT_CATEGORIES;
    },
    CACHE_TTL.VERY_LONG
  );
}

export async function getCachedRoles() {
  return getOrSetCache(
    CACHE_KEYS.ROLES,
    async () => {
      const snap = await adminDb.collection('settings').doc('roles').get();
      if (!snap.exists) return ALL_STAFF_ROLES;
      return snap.data()?.list || ALL_STAFF_ROLES;
    },
    CACHE_TTL.VERY_LONG
  );
}

export async function getCachedPermissions() {
  return getOrSetCache(
    CACHE_KEYS.PERMISSIONS,
    async () => {
      const snap = await adminDb.collection('settings').doc('permissions').get();
      if (!snap.exists) return {}; // Default empty permissions mapping
      return snap.data() || {};
    },
    CACHE_TTL.VERY_LONG
  );
}

export async function getCachedCompanySettings() {
  return getOrSetCache(
    CACHE_KEYS.SETTINGS + ':company',
    async () => {
      const snap = await adminDb.collection('settings').doc('company').get();
      if (!snap.exists) return COMPANY_DETAILS;
      return snap.data() || COMPANY_DETAILS;
    },
    CACHE_TTL.VERY_LONG
  );
}

export async function getCachedGSTSettings() {
  return getOrSetCache(
    CACHE_KEYS.GST,
    async () => {
      const snap = await adminDb.collection('settings').doc('gst').get();
      if (!snap.exists) return DEFAULT_GST;
      return snap.data() || DEFAULT_GST;
    },
    CACHE_TTL.VERY_LONG
  );
}

export async function getCachedDeliverySettings() {
  return getOrSetCache(
    CACHE_KEYS.DELIVERY,
    async () => {
      const snap = await adminDb.collection('settings').doc('delivery').get();
      if (!snap.exists) return DEFAULT_DELIVERY;
      return snap.data() || DEFAULT_DELIVERY;
    },
    CACHE_TTL.VERY_LONG
  );
}

export async function getCachedTallySettings() {
  return {
    companyName: 'Auravionx',
    salesLedgerName: 'Sales',
    cgstLedgerName: 'Output CGST',
    sgstLedgerName: 'Output SGST',
    igstLedgerName: 'Output IGST',
    cashLedgerName: 'Cash',
    bankLedgerName: 'Bank Account',
    upiLedgerName: 'UPI / Paytm',
    sundryDebtorsGroup: 'Sundry Debtors',
  };
}

// --- INVALIDATORS ---

import { redis } from './redis';
import { recordInvalidation } from './metrics';

export async function invalidateCategories() {
  if (!redis) return;
  await redis.del(CACHE_KEYS.CATEGORIES);
  recordInvalidation();
}

export async function invalidateRoles() {
  if (!redis) return;
  await redis.del(CACHE_KEYS.ROLES);
  recordInvalidation();
}

export async function invalidatePermissions() {
  if (!redis) return;
  await redis.del(CACHE_KEYS.PERMISSIONS);
  recordInvalidation();
}

export async function invalidateCompanySettings() {
  if (!redis) return;
  await redis.del(CACHE_KEYS.SETTINGS + ':company');
  recordInvalidation();
}

export async function invalidateGSTSettings() {
  if (!redis) return;
  await redis.del(CACHE_KEYS.GST);
  recordInvalidation();
}

export async function invalidateDeliverySettings() {
  if (!redis) return;
  await redis.del(CACHE_KEYS.DELIVERY);
  recordInvalidation();
}

export async function invalidateTallySettings() {
  if (!redis) return;
  await redis.del(CACHE_KEYS.SETTINGS + ':tally');
  recordInvalidation();
}
