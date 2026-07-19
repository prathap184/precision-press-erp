'use server';

import { adminDb as db } from "@/lib/firebase-admin";
import { revalidatePath } from "next/cache";

export async function addToWishlist(userId: string, product: any) {
  try {
    const wishlistRef = db.collection('wishlist');
    
    // Check if already in wishlist
    const existing = await wishlistRef
      .where('userId', '==', userId)
      .where('productId', '==', product.id)
      .get();
      
    if (!existing.empty) {
      return { success: true, message: 'Already in wishlist' };
    }

    await wishlistRef.add({
      userId,
      productId: product.id,
      productName: product.name,
      category: product.category,
      basePrice: product.baseRate || 0,
      imageUrl: product.media?.images?.[0] || '',
      createdAt: new Date().toISOString()
    });

    revalidatePath('/customer/wishlist');
    return { success: true };
  } catch (error: any) {
    console.error('Wishlist error:', error);
    return { success: false, error: error.message };
  }
}

export async function removeFromWishlist(id: string) {
  try {
    await db.collection('wishlist').doc(id).delete();
    revalidatePath('/customer/wishlist');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleWishlist(userId: string, product: any) {
  try {
    if (!userId) return { success: false, error: 'User not authenticated' };
    
    const wishlistRef = db.collection('wishlist');
    const existing = await wishlistRef
      .where('userId', '==', userId)
      .where('productId', '==', product.id)
      .get();
      
    if (!existing.empty) {
      // Use the first one found
      const docId = existing.docs[0].id;
      await wishlistRef.doc(docId).delete();
      revalidatePath('/customer/wishlist');
      return { success: true, action: 'removed' };
    }

    await wishlistRef.add({
      userId,
      productId: product.id,
      productName: product.name,
      category: product.category,
      basePrice: product.baseRate || product.basePrice || 0,
      imageUrl: product.media?.images?.[0] || '',
      createdAt: new Date().toISOString()
    });

    revalidatePath('/customer/wishlist');
    return { success: true, action: 'added' };
  } catch (error: any) {
    console.error('Toggle wishlist error:', error);
    return { success: false, error: error.message };
  }
}

export async function getWishlistStatus(userId: string, productId: string) {
  if (!userId || !productId) return false;
  try {
    const snap = await db.collection('wishlist')
      .where('userId', '==', userId)
      .where('productId', '==', productId)
      .limit(1)
      .get();
    return !snap.empty;
  } catch (error) {
    return false;
  }
}
