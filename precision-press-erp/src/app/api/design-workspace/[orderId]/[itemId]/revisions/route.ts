import { NextRequest, NextResponse } from 'next/server';
import { getDesignRevisions } from '@/lib/design-workspace-db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderId: string; itemId: string } }
) {
  try {
    const revisions = await getDesignRevisions(params.orderId, params.itemId);
    return NextResponse.json({ revisions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
