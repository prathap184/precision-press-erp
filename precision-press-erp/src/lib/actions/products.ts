'use server';

import { supabase } from "@/lib/supabase";
import { Product } from "@/types/models";
import { revalidatePath } from "next/cache";
import { invalidateProduct, invalidateProductsList } from "@/lib/cache/products";

function parseProduct(row: any): Product {
  return {
    ...row,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media: {
      images: row.media_images || [],
      video: row.media_video_url ? { url: row.media_video_url } : undefined
    },
    specs: {
      maxWidth: row.specs_max_width,
      gsm: row.specs_gsm,
      description: row.specs_description
    },
    eyeletPricing: {
      metal: row.eyelet_metal || 0,
      plastic: row.eyelet_plastic || 0,
      none: 0
    },
    deliveryPricing: {
      selfPickup: 0,
      door: row.delivery_door || 0,
      courier: row.delivery_courier || 0,
      transport: row.delivery_transport || 0
    },
    workflowSteps: row.workflow_steps || []
  };
}

export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'ACTIVE')
    .limit(2000);

  if (error) throw error;
  return data.map(parseProduct);
}

export async function getProductsByCategory(category: string) {
  const dbCategory = category.toUpperCase().replace('-', '_');
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('category', dbCategory)
    .eq('status', 'ACTIVE')
    .limit(50);

  if (error) throw error;
  return data.map(parseProduct);
}

export async function getAdminProductsByCategory(category: string, search?: string, lastId?: string) {
  const dbCategory = category.toUpperCase().replace('-', '_');
  
  let query = supabase
    .from('products')
    .select('*')
    .eq('category', dbCategory);

  if (search && search.trim() !== '') {
    query = query.ilike('name', `%${search.trim()}%`).order('name', { ascending: true });
  } else {
    query = query.in('status', ['ACTIVE', 'INACTIVE']).order('status', { ascending: true }).order('id', { ascending: false });
  }

  // Very naive pagination for now
  const { data, error } = await query.limit(50);

  if (error) throw error;
  return data.map(parseProduct);
}

export async function createProduct(data: Partial<Product>) {
  if (!data.id) return { success: false, error: "Product ID is mandatory" };
  if (parseInt(data.id) < 6000) return { success: false, error: "Product ID must be 6000 or greater." };
  if ((data.baseRate ?? 0) <= 0) return { success: false, error: "Base Rate must be > 0." };

  try {
    const { HSNService } = await import('@/services/hsnService');
    const hsns = await HSNService.getActiveHSNs();
    const hsn = hsns.find(h => h.hsn_code === data.hsn_code);
    if (data.hsn_code && !hsn) return { success: false, error: "Invalid HSN Code selected." };

    const { data: existing, error: fetchError } = await supabase
      .from('products')
      .select('id')
      .eq('id', data.id)
      .single();

    if (existing) {
      return { success: false, error: "Product ID already exists. Duplicates are not allowed." };
    }

    const newProduct = {
      id: data.id,
      name: data.name,
      name_lowercase: data.name?.toLowerCase() || '',
      category: data.category,
      printer_category: data.printerCategory,
      status: 'ACTIVE',
      base_rate: data.baseRate,
      hsn_master_id: hsn?.id || null,
      hsn_code: hsn?.hsn_code || null,
      hsn_description: hsn?.description || null,
      gst_rate: hsn?.current_rate?.gst_rate || null,
      gst_effective_from: hsn?.current_rate?.effective_from || null,
      eyelet_metal: data.eyeletPricing?.metal || 0,
      eyelet_plastic: data.eyeletPricing?.plastic || 0,
      delivery_door: data.deliveryPricing?.door || 0,
      delivery_courier: data.deliveryPricing?.courier || 0,
      delivery_transport: data.deliveryPricing?.transport || 0,
      media_images: data.media?.images || [],
      media_video_url: data.media?.video?.url || null,
      specs_max_width: data.specs?.maxWidth || null,
      specs_gsm: data.specs?.gsm || null,
      specs_description: data.specs?.description || null,
      workflow_steps: data.workflowSteps || []
    };

    const { error: insertError } = await supabase.from('products').insert([newProduct]);
    if (insertError) throw insertError;

    if (hsn) {
       await supabase.from('product_audit_logs').insert({
         product_id: data.id,
         new_hsn_code: hsn.hsn_code,
         new_gst_rate: hsn.current_rate?.gst_rate,
         updated_by: 'ADMIN', // Hardcoded temporarily until we pull session
         reason: 'Initial Product Creation'
       });
    }

    await invalidateProduct(data.id, data as Product);
    await invalidateProductsList();
    revalidatePath('/admin/products');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: "Failed to save product to database." };
  }
}

export async function updateProduct(id: string, data: Partial<Product>) {
  if (data.baseRate !== undefined && data.baseRate <= 0) return { success: false, error: "Base Rate must be > 0." };

  try {
    const { HSNService } = await import('@/services/hsnService');
    const hsns = await HSNService.getActiveHSNs();
    const hsn = data.hsn_code ? hsns.find(h => h.hsn_code === data.hsn_code) : null;
    if (data.hsn_code && !hsn) return { success: false, error: "Invalid HSN Code selected." };

    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingProduct || fetchError) {
      return { success: false, error: "Product not found." };
    }

    const newId = (data.id ?? id).toString().trim();
    if (!newId) return { success: false, error: "Product ID is mandatory." };
    if (parseInt(newId) < 6000) return { success: false, error: "Product ID must be 6000 or greater." };

    const hsnChanged = data.hsn_code && data.hsn_code !== existingProduct.hsn_code;

    const updatePayload = {
      name: data.name,
      name_lowercase: data.name?.toLowerCase(),
      category: data.category,
      printer_category: data.printerCategory,
      base_rate: data.baseRate,
      hsn_master_id: hsnChanged ? hsn?.id : undefined,
      hsn_code: hsnChanged ? hsn?.hsn_code : undefined,
      hsn_description: hsnChanged ? hsn?.description : undefined,
      gst_rate: hsnChanged ? hsn?.current_rate?.gst_rate : undefined,
      gst_effective_from: hsnChanged ? hsn?.current_rate?.effective_from : undefined,
      eyelet_metal: data.eyeletPricing?.metal,
      eyelet_plastic: data.eyeletPricing?.plastic,
      delivery_door: data.deliveryPricing?.door,
      delivery_courier: data.deliveryPricing?.courier,
      delivery_transport: data.deliveryPricing?.transport,
      media_images: data.media?.images,
      media_video_url: data.media?.video?.url,
      specs_max_width: data.specs?.maxWidth,
      specs_gsm: data.specs?.gsm,
      specs_description: data.specs?.description,
      workflow_steps: data.workflowSteps,
      updated_at: new Date().toISOString()
    };

    // Remove undefined fields
    Object.keys(updatePayload).forEach(key => (updatePayload as any)[key] === undefined && delete (updatePayload as any)[key]);

    if (newId !== id) {
      // Create new and delete old
      const { data: existingNewDoc } = await supabase.from('products').select('id').eq('id', newId).single();
      if (existingNewDoc) return { success: false, error: "Product ID already exists." };

      const { error: insertError } = await supabase.from('products').insert([{ ...existingProduct, ...updatePayload, id: newId }]);
      if (insertError) throw insertError;

      await supabase.from('products').delete().eq('id', id);

      if (hsnChanged && hsn) {
         await supabase.from('product_audit_logs').insert({
           product_id: newId,
           old_hsn_code: existingProduct.hsn_code,
           new_hsn_code: hsn.hsn_code,
           old_gst_rate: existingProduct.gst_rate,
           new_gst_rate: hsn.current_rate?.gst_rate,
           updated_by: 'ADMIN',
           reason: 'Manual HSN Change during ID update'
         });
      }

      await invalidateProduct(id);
      await invalidateProduct(newId, { ...data, id: newId } as Product);
      await invalidateProductsList();

      revalidatePath('/admin/products');
      revalidatePath(`/admin/products/${newId}`);
      return { success: true };
    }

    const { error: updateError } = await supabase.from('products').update(updatePayload).eq('id', id);
    if (updateError) throw updateError;

    if (hsnChanged && hsn) {
       await supabase.from('product_audit_logs').insert({
         product_id: id,
         old_hsn_code: existingProduct.hsn_code,
         new_hsn_code: hsn.hsn_code,
         old_gst_rate: existingProduct.gst_rate,
         new_gst_rate: hsn.current_rate?.gst_rate,
         updated_by: 'ADMIN',
         reason: 'Manual HSN Change'
       });
    }

    await invalidateProduct(id, { ...data, id } as Product);
    await invalidateProductsList();
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${id}`);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to update product:", error);
    return { success: false, error: "Failed to update product: " + (error?.message || "Unknown error") };
  }
}

export async function softDeleteProduct(id: string) {
  try {
    const { error } = await supabase
      .from('products')
      .update({ status: 'INACTIVE', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    await invalidateProduct(id);
    await invalidateProductsList();
    revalidatePath('/admin/products');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: "Failed to deactivate product." };
  }
}

export async function refreshProductGST(id: string, userId: string) {
  try {
    const { ProductService } = await import("@/services/productService");
    await ProductService.refreshGSTFromHSN(id, userId);
    
    // Invalidate caches
    await invalidateProduct(id);
    await invalidateProductsList();
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${id}`);
    
    return { success: true };
  } catch (error: any) {
    console.error("Failed to refresh GST:", error);
    return { success: false, error: error?.message || "Unknown error" };
  }
}
