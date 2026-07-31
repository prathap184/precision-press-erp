import { NextResponse } from 'next/server';
import { invalidate, invalidateMultiple } from '@/lib/cache/cache';
import { CACHE_KEYS } from '@/lib/cache/constants';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { keys, type } = body;
    
    // Quick helpers
    if (type === 'products') {
      await invalidate(CACHE_KEYS.PRODUCTS_LIST);
      await invalidate(CACHE_KEYS.PRODUCTS_HASH);
      return NextResponse.json({ success: true, message: 'Products cache cleared' });
    }

    if (keys && Array.isArray(keys)) {
      await invalidateMultiple(keys);
      return NextResponse.json({ success: true, message: 'Keys cleared' });
    }
    
    return NextResponse.json({ success: false, error: 'No keys or type provided' }, { status: 400 });
  } catch (err) {
    console.error('[Cache Revalidate API Error]', err);
    return NextResponse.json({ success: false, error: 'Failed to clear cache' }, { status: 500 });
  }
}
