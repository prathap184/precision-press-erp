'use server';

import { adminDb as db } from "@/lib/firebase-admin";
import { revalidatePath } from "next/cache";

export async function addToCart(userId: string, product: any) {
  try {
    const cartRef = db.collection('cart');
    
    // Check if already in cart
    const existing = await cartRef
      .where('userId', '==', userId)
      .where('productId', '==', product.id)
      .get();
      
    if (!existing.empty) {
      return { success: true, message: 'Already in cart' };
    }

    await cartRef.add({
      userId,
      productId: product.id,
      productName: product.name,
      category: product.category,
      basePrice: product.baseRate || 0,
      imageUrl: product.media?.images?.[0] || '',
      createdAt: new Date().toISOString()
    });

    revalidatePath('/customer/cart');
    return { success: true };
  } catch (error: any) {
    console.error('Cart error:', error);
    return { success: false, error: error.message };
  }
}

export async function removeFromCart(id: string) {
  try {
    await db.collection('cart').doc(id).delete();
    revalidatePath('/customer/cart');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleCart(userId: string, product: any) {
  try {
    if (!userId) return { success: false, error: 'User not authenticated' };
    
    const cartRef = db.collection('cart');
    const existing = await cartRef
      .where('userId', '==', userId)
      .where('productId', '==', product.id)
      .get();
      
    if (!existing.empty) {
      // Use the first one found
      const docId = existing.docs[0].id;
      await cartRef.doc(docId).delete();
      revalidatePath('/customer/cart');
      return { success: true, action: 'removed' };
    }

    await cartRef.add({
      userId,
      productId: product.id,
      productName: product.name,
      category: product.category,
      basePrice: product.baseRate || product.basePrice || 0,
      imageUrl: product.media?.images?.[0] || '',
      createdAt: new Date().toISOString()
    });

    revalidatePath('/customer/cart');
    return { success: true, action: 'added' };
  } catch (error: any) {
    console.error('Toggle cart error:', error);
    return { success: false, error: error.message };
  }
}

export async function getCartStatus(userId: string, productId: string) {
  if (!userId || !productId) return false;
  try {
    const snap = await db.collection('cart')
      .where('userId', '==', userId)
      .where('productId', '==', productId)
      .limit(1)
      .get();
    return !snap.empty;
  } catch (error) {
    return false;
  }
}
