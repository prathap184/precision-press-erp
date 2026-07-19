import { supabase } from '@/lib/supabase';
import { HSNService } from './hsnService';
import { invalidateProduct } from '../lib/cache/products';

export class ProductService {
  /**
   * Updates a product's HSN by validating against HSNService in a single transaction-like flow.
   * Note: For true ACID guarantees, this should be moved to a Supabase RPC function.
   */
  static async updateProductHSN(productId: string, hsnCode: string, userId: string, reason: string = 'HSN Assignment / Change'): Promise<void> {
    // 1. Fetch exact HSN from Service to guarantee validity
    const activeHSNs = await HSNService.getActiveHSNs();
    const hsn = activeHSNs.find(h => h.hsn_code === hsnCode);

    if (!hsn) {
      throw new Error(`Invalid or Inactive HSN Code: ${hsnCode}`);
    }

    if (!hsn.current_rate) {
      throw new Error(`HSN Code ${hsnCode} does not have an active GST rate.`);
    }

    // 2. Fetch current product state
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('hsn_code, gst_rate, product_snapshot_version')
      .eq('id', productId)
      .single();

    if (productError) throw productError;

    // If there is exactly no change, we can safely skip to avoid bumping snapshot version unnecessarily.
    if (product.hsn_code === hsnCode && Number(product.gst_rate) === Number(hsn.current_rate.gst_rate)) {
      return;
    }

    const newSnapshotVersion = (product.product_snapshot_version || 1) + 1;

    // 3. Update the Product
    const { error: updateError } = await supabase
      .from('products')
      .update({
        hsn_master_id: hsn.id,
        hsn_code: hsn.hsn_code,
        hsn_description: hsn.description,
        gst_rate: hsn.current_rate.gst_rate,
        gst_effective_from: hsn.current_rate.effective_from,
        product_snapshot_version: newSnapshotVersion
      })
      .eq('id', productId);

    if (updateError) throw updateError;

    // 4. Create Audit Log
    const { error: auditError } = await supabase.from('product_audit_logs').insert({
      product_id: productId,
      old_hsn_code: product.hsn_code,
      new_hsn_code: hsn.hsn_code,
      old_gst_rate: product.gst_rate,
      new_gst_rate: hsn.current_rate.gst_rate,
      updated_by: userId,
      reason: reason
    });
    
    if (auditError) {
      console.error('Failed to write product audit log', auditError);
      // We don't rollback the product update if audit logging fails, 
      // but in a strict enterprise system, we would use an RPC transaction to roll back both.
    }

    // 5. Invalidate Redis Cache
    await this.invalidateProductCache(productId);
  }

  /**
   * Dedicated action to refresh GST from the master HSN list manually.
   * This is explicitly required because GST changes do not flow to products automatically.
   */
  static async refreshGSTFromHSN(productId: string, userId: string): Promise<void> {
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('hsn_code')
      .eq('id', productId)
      .single();

    if (fetchError) throw fetchError;
    if (!product.hsn_code) throw new Error('Product does not have an HSN code assigned.');

    await this.updateProductHSN(productId, product.hsn_code, userId, 'Manual Refresh GST From HSN Master');
  }

  /**
   * Invalidate Product cache in Redis to ensure subsequent reads fetch the fresh HSN info.
   */
  private static async invalidateProductCache(productId: string) {
    console.log(`[Cache Invalidated] product:${productId}`);
    await invalidateProduct(productId);
  }
}
