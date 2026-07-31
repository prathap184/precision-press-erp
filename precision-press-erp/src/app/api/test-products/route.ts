import { NextResponse } from 'next/server';
import { getProducts } from '@/lib/actions/products';

export async function GET() {
  try {
    const products = await getProducts();
    return NextResponse.json({ success: true, count: products.length, products: products.slice(0,2) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, stack: e.stack });
  }
}
