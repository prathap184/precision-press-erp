'use server';

import { getOrSetCache, invalidate, invalidateMultiple } from './cache';
import { CACHE_KEYS, CACHE_TTL } from './constants';
import { getProducts as fetchProductsFromDb } from '@/lib/actions/products';
import { adminDb as db } from '@/lib/firebase-admin';
import { Product } from '@/types/models';
import { WorkflowStep } from '@/types/workflow';

export async function getCachedProductsList() {
  return await fetchProductsFromDb();
}

import { supabaseServer } from '@/lib/supabase-server';

export async function getCachedProduct(productId: string) {
  return getOrSetCache(
    CACHE_KEYS.PRODUCT(productId),
    async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId);
      let query = supabaseServer.from('inventory_item').select('*');
      if (isUuid) {
        query = query.or(`id.eq.${productId},sku.eq.${productId},code.eq.${productId}`);
      } else {
        query = query.or(`sku.eq.${productId},code.eq.${productId}`);
      }
      const { data: row, error } = await query.limit(1).maybeSingle();
        
      if (error || !row) return null;
      
      const meta = row.metadata || {};
      
      return {
        id: row.sku || row.code || row.id,
        rawId: row.id,
        sku: row.sku,
        code: row.code,
        name: row.name,
        category: row.category,
        baseRate: meta.baseRate != null ? Number(meta.baseRate) : ((row.sale_price != null) ? (Number(row.sale_price) / 100) : (row.base_rate || 0)),
        printerCategory: row.printing_category_name || meta.printing_category_name || meta.printerCategory || row.printer_category,
        printerSubCategory: row.printing_subcategory_name || meta.printing_subcategory_name || meta.printerSubCategory || row.printer_subcategory,
        printing_category_name: row.printing_category_name || meta.printing_category_name || meta.printerCategory || row.printer_category,
        printing_subcategory_name: row.printing_subcategory_name || meta.printing_subcategory_name || meta.printerSubCategory,
        printing_category_id: row.printing_category_id || meta.printing_category_id,
        printing_subcategory_id: row.printing_subcategory_id || meta.printing_subcategory_id,
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
