'use server';

import { getOrSetCache, invalidate, invalidateMultiple } from './cache';
import { CACHE_KEYS, CACHE_TTL } from './constants';
import { getProducts as fetchProductsFromDb } from '@/lib/actions/products';
import { adminDb as db } from '@/lib/firebase-admin';
import { Product } from '@/types/models';
import { WorkflowStep } from '@/types/workflow';

export async function getCachedProductsList() {
  return getOrSetCache(
    CACHE_KEYS.PRODUCTS_LIST,
    async () => {
      const products = await fetchProductsFromDb();
      return products;
    },
    CACHE_TTL.LONG
  );
}

export async function getCachedProduct(productId: string) {
  return getOrSetCache(
    CACHE_KEYS.PRODUCT(productId),
    async () => {
      const snap = await db.collection('products').doc(productId).get();
      if (!snap.exists) return null;
      const data = snap.data();
      return {
        id: snap.id,
        name: data.name,
        category: data.category,
        baseRate: data.baseRate,
        deliveryPricing: data.deliveryPricing,
        eyeletPricing: data.eyeletPricing,
        media: data.media,
        specs: data.specs,
        printerCategory: data.printerCategory,
        status: data.status,
        gst_rate: data.gst_rate,
        workflowId: snap.id // Reference for the separate workflow cache
      };
    },
    CACHE_TTL.LONG
  );
}

export async function getCachedWorkflow(productId: string): Promise<WorkflowStep[] | null> {
  return getOrSetCache(
    CACHE_KEYS.WORKFLOW(productId),
    async () => {
      const snap = await db.collection('products').doc(productId).get();
      if (!snap.exists) return null;
      return snap.data()?.workflowSteps || [];
    },
    CACHE_TTL.LONG
  );
}

import { redis } from './redis';

export async function updateProductInHash(productId: string, productData: any) {
  if (!redis) return;
  try {
    await redis.hset(CACHE_KEYS.PRODUCTS_HASH, { [productId]: productData });
  } catch (err) {
    console.error(`[Redis Error] Failed to update product ${productId} in hash:`, err);
  }
}

export async function invalidateProduct(productId: string, freshData?: any) {
  // If we have freshData from a mutation, update the hash map.
  if (freshData) {
    await updateProductInHash(productId, freshData);
  }
  
  await invalidateMultiple([
    CACHE_KEYS.PRODUCT(productId),
    CACHE_KEYS.WORKFLOW(productId),
    CACHE_KEYS.PRODUCTS_LIST
  ]);
}

export async function invalidateProductsList() {
  await invalidate(CACHE_KEYS.PRODUCTS_LIST);
}
