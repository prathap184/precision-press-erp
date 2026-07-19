import { NextRequest, NextResponse } from 'next/server';
import { getDesignProofs } from '@/lib/design-workspace-db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { orderId: string; itemId: string } }
) {
  try {
    const proofs = await getDesignProofs(params.orderId, params.itemId);
    return NextResponse.json({ proofs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
