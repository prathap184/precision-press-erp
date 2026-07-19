// @ts-nocheck
import { supabase } from '@/lib/supabase';

export async function toggleWishlistClient(userId: string, product: any) {
  try {
    if (!userId) return { success: false, error: 'User not authenticated' };

    const { data: existing, error: fetchError } = await supabase
      .from('wishlist')
      .select('id')
      .eq('userId', userId)
      .eq('productId', product.id)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (existing?.id) {
      const { error: deleteError } = await supabase.from('wishlist').delete().eq('id', existing.id);
      if (deleteError) throw deleteError;
      return { success: true, action: 'removed' };
    }

    const { error: insertError } = await supabase.from('wishlist').insert({
      userId,
      productId: product.id,
      productName: product.name,
      category: product.category,
      basePrice: product.baseRate || 0,
      imageUrl: (product.media?.images && product.media.images[0]) || '',
      createdAt: new Date().toISOString(),
    });
    if (insertError) throw insertError;

    return { success: true, action: 'added' };
  } catch (error: any) {
    console.error('Client wishlist error:', error);
    return { success: false, error: error.message };
  }
}
