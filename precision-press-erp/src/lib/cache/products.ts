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

import { supabaseServer } from '@/lib/supabase-server';

export async function getCachedProduct(productId: string) {
  return getOrSetCache(
    CACHE_KEYS.PRODUCT(productId),
    async () => {
      const { data: row, error } = await supabaseServer
        .from('inventory_item')
        .select('*')
        .eq('sku', productId)
        .single();
        
      if (error || !row) return null;
      
      const meta = row.metadata || {};
      
      return {
        id: row.sku || row.code || row.id,
        name: row.name,
        category: row.category,
        baseRate: meta.isDirectSelling ? ((row.sale_price != null) ? (Number(row.sale_price) / 100) : row.base_rate) : ((meta.baseRate != null) ? (Number(meta.baseRate) / 100) : ((row.sale_price != null) ? (Number(row.sale_price) / 100) : row.base_rate)),
        printerCategory: meta.printerCategory || row.printer_category,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        hsn_code: row.hsn_code,
        gst_rate: row.gst_rate,
        media: {
          images: meta.media?.images || row.media_images || [],
          video: meta.media?.video?.url || row.media_video_url ? { url: meta.media?.video?.url || row.media_video_url } : undefined
        },
        specs: {
          maxWidth: meta.specs?.maxWidth || row.specs_max_width,
          gsm: meta.specs?.gsm || row.specs_gsm,
          description: meta.specs?.description || row.specs_description
        },
        eyeletPricing: {
          metal: meta.eyeletPricing?.metal || row.eyelet_metal || 0,
          plastic: meta.eyeletPricing?.plastic || row.eyelet_plastic || 0,
          none: 0
        },
        deliveryPricing: {
          selfPickup: 0,
          door: meta.deliveryPricing?.door || row.delivery_door || 0,
          courier: meta.deliveryPricing?.courier || row.delivery_courier || 0,
          transport: meta.deliveryPricing?.transport || row.delivery_transport || 0
        },
        workflowSteps: row.workflow_steps || [],
        workflowId: row.sku || row.code || row.id
      };
    },
    CACHE_TTL.LONG
  );
}

export async function getCachedWorkflow(productId: string): Promise<WorkflowStep[] | null> {
  return getOrSetCache(
    CACHE_KEYS.WORKFLOW(productId),
    async () => {
      const { data: row, error } = await supabaseServer
        .from('inventory_item')
        .select('workflow_steps')
        .eq('sku', productId)
        .single();
        
      if (error || !row) return null;
      return row.workflow_steps || [];
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
