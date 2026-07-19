import { supabase } from '@/lib/supabase';
import { HSNMaster, HSNGSTRate, HSNWithRate } from '@/types/hsn';

export class HSNService {
  /**
   * Fetches all active HSN codes with their current active GST rate and products count.
   */
  static async getActiveHSNs(): Promise<HSNWithRate[]> {
    const { data, error } = await supabase
      .from('hsn_master')
      .select(`
        *,
        hsn_gst_rates (*)
      `)
      .eq('is_active', true)
      .is('hsn_gst_rates.effective_to', null)
      .order('hsn_code', { ascending: true });

    if (error) throw error;

    // Fetch product counts
    const { data: products } = await supabase
      .from('products')
      .select('hsn_code')
      .eq('status', 'ACTIVE');

    const counts: Record<string, number> = {};
    if (products) {
      for (const p of products) {
        if (p.hsn_code) {
          counts[p.hsn_code] = (counts[p.hsn_code] || 0) + 1;
        }
      }
    }

    return data.map((hsn: any) => ({
      ...hsn,
      current_rate: hsn.hsn_gst_rates?.[0] || null,
      products_count: counts[hsn.hsn_code] || 0
    }));
  }

  /**
   * Search across all HSNs (active or inactive) by code or description.
   */
  static async searchHSNs(query: string): Promise<HSNWithRate[]> {
    const { data, error } = await supabase
      .from('hsn_master')
      .select(`
        *,
        hsn_gst_rates (*)
      `)
      .is('hsn_gst_rates.effective_to', null)
      .or(`hsn_code.ilike.%${query}%,description.ilike.%${query}%`)
      .order('hsn_code', { ascending: true });

    if (error) throw error;

    const { data: products } = await supabase
      .from('products')
      .select('hsn_code')
      .eq('status', 'ACTIVE');

    const counts: Record<string, number> = {};
    if (products) {
      for (const p of products) {
        if (p.hsn_code) {
          counts[p.hsn_code] = (counts[p.hsn_code] || 0) + 1;
        }
      }
    }

    return data.map((hsn: any) => ({
      ...hsn,
      current_rate: hsn.hsn_gst_rates?.[0] || null,
      products_count: counts[hsn.hsn_code] || 0
    }));
  }

  /**
   * Fetches the complete GST history for a specific HSN.
   */
  static async getHSNHistory(hsnId: string): Promise<HSNGSTRate[]> {
    const { data, error } = await supabase
      .from('hsn_gst_rates')
      .select('*')
      .eq('hsn_id', hsnId)
      .order('effective_from', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Validates if an HSN can be disabled.
   * Business Rule: Cannot disable an HSN used by active products.
   */
  static async canDisableHSN(hsnCode: string): Promise<{ allowed: boolean; reason?: string }> {
    const { count, error } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('hsn_code', hsnCode)
      .eq('status', 'ACTIVE');

    if (error) throw error;

    if (count && count > 0) {
      return { allowed: false, reason: `Cannot disable: This HSN is currently used by ${count} active product(s).` };
    }

    return { allowed: true };
  }

  /**
   * Disable an HSN code.
   */
  static async disableHSN(hsnId: string, hsnCode: string, userId: string, reason: string = 'Disabled manually'): Promise<void> {
    const check = await this.canDisableHSN(hsnCode);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const { error } = await supabase
      .from('hsn_master')
      .update({ 
        is_active: false, 
        updated_by: userId, 
        reason_for_change: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', hsnId);

    if (error) throw error;
  }

  /**
   * Enable an HSN code.
   */
  static async enableHSN(hsnId: string, userId: string, reason: string = 'Enabled manually'): Promise<void> {
    const { error } = await supabase
      .from('hsn_master')
      .update({ 
        is_active: true,
        updated_by: userId, 
        reason_for_change: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', hsnId);

    if (error) throw error;
  }

  /**
   * Update HSN description.
   * Business Rule: HSN code itself cannot be edited once products reference it, but description can be.
   */
  static async updateHSNDescription(hsnId: string, description: string, userId: string, reason: string = 'Description update'): Promise<void> {
    const { error } = await supabase
      .from('hsn_master')
      .update({ 
        description,
        updated_by: userId, 
        reason_for_change: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', hsnId);

    if (error) throw error;
  }

  /**
   * Create a new HSN code along with its initial GST rate.
   */
  static async createHSN(hsnCode: string, description: string, gstRate: number, effectiveFrom: string, userId: string): Promise<void> {
    const { data: hsnData, error: hsnError } = await supabase
      .from('hsn_master')
      .insert({
        hsn_code: hsnCode,
        description: description,
        is_active: true,
        created_by: userId
      })
      .select('id')
      .single();

    if (hsnError) throw hsnError;

    const { error: rateError } = await supabase
      .from('hsn_gst_rates')
      .insert({
        hsn_id: hsnData.id,
        gst_rate: gstRate,
        effective_from: effectiveFrom,
        created_by: userId,
        reason_for_change: 'Initial rate'
      });

    if (rateError) {
      await supabase.from('hsn_master').delete().eq('id', hsnData.id);
      throw rateError;
    }
  }

  /**
   * Adds a new GST rate revision.
   * This retires the current active rate and creates a new one.
   */
  static async addNewGSTRate(hsnId: string, gstRate: number, effectiveFrom: string, userId: string, reason: string = 'Rate revision'): Promise<void> {
    // Check if the new effective date is valid (must not be earlier than current effective_from)
    const { data: currentRate, error: currentError } = await supabase
      .from('hsn_gst_rates')
      .select('id, effective_from')
      .eq('hsn_id', hsnId)
      .is('effective_to', null)
      .single();

    if (currentError && currentError.code !== 'PGRST116') {
      throw currentError;
    }

    if (currentRate) {
      if (new Date(effectiveFrom) <= new Date(currentRate.effective_from)) {
        throw new Error(`New rate effective date (${effectiveFrom}) must be later than current rate effective date (${currentRate.effective_from}).`);
      }

      // Retire the current rate as of effectiveFrom
      const { error: retireError } = await supabase
        .from('hsn_gst_rates')
        .update({ 
          effective_to: effectiveFrom,
          updated_by: userId,
          reason_for_change: 'Retired by new rate revision',
          updated_at: new Date().toISOString()
        })
        .eq('id', currentRate.id);
      
      if (retireError) throw retireError;
    }

    // Insert new rate
    const { error: insertError } = await supabase
      .from('hsn_gst_rates')
      .insert({
        hsn_id: hsnId,
        gst_rate: gstRate,
        effective_from: effectiveFrom,
        created_by: userId,
        reason_for_change: reason
      });

    if (insertError) throw insertError;
  }
}

