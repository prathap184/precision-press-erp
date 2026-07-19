import { NextRequest, NextResponse } from 'next/server';
import { respondToProof, getDesignProofs } from '@/lib/design-workspace-db';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string; itemId: string } }
) {
  try {
    const body = await req.json();
    const { proofId, rejectionReason } = body;

    if (!rejectionReason?.trim()) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
    }

    if (!proofId) {
      const proofs = await getDesignProofs(params.orderId, params.itemId);
      const latestPending = proofs.filter(p => p.customerResponse === 'PENDING').pop();
      if (!latestPending) {
        return NextResponse.json({ error: 'No pending proof found' }, { status: 404 });
      }
      await respondToProof(latestPending.id, 'REJECTED', rejectionReason);
    } else {
      await respondToProof(proofId, 'REJECTED', rejectionReason);
    }

    // Update itemWorkspace JSON fields via fetch-merge-update
    const { data: current } = await supabaseAdmin
      .from('order_items')
      .select('"itemWorkspace"')
      .eq('id', params.itemId)
      .single();

    const currentWorkspace = (current as any)?.itemWorkspace || {};
    const updatedWorkspace = {
      ...currentWorkspace,
      designWorkflowStatus: 'REJECTED',
      approvalStatus: 'REJECTED',
      rejectedAt: new Date().toISOString(),
      rejectionReason,
      lastUpdatedAt: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('order_items')
      .update({ 'itemWorkspace': updatedWorkspace } as any)
      .eq('id', params.itemId);

    return NextResponse.json({ success: true, status: 'REJECTED' });
  } catch (error: any) {
    console.error('Reject proof error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
