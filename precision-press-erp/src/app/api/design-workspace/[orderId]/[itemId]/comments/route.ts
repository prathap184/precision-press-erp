import { NextRequest, NextResponse } from 'next/server';
import { getDesignComments } from '@/lib/design-workspace-db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderId: string; itemId: string } }
) {
  try {
    const comments = await getDesignComments(params.orderId, params.itemId);
    return NextResponse.json({ comments });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
