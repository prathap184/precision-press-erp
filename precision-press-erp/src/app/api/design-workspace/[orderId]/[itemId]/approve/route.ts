import { NextRequest, NextResponse } from 'next/server';
import { respondToProof, getDesignProofs } from '@/lib/design-workspace-db';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string; itemId: string } }
) {
  try {
    const body = await req.json();
    const { proofId, approvedBy, approvedByName } = body;

    if (!proofId) {
      // If no specific proofId, find the latest pending proof
      const proofs = await getDesignProofs(params.orderId, params.itemId);
      const latestPending = proofs.filter(p => p.customerResponse === 'PENDING').pop();
      if (!latestPending) {
        return NextResponse.json({ error: 'No pending proof found' }, { status: 404 });
      }
      await respondToProof(latestPending.id, 'APPROVED');
    } else {
      await respondToProof(proofId, 'APPROVED');
    }

    // Update itemWorkspace JSON fields using fetch-merge-update approach
    const { data: current } = await supabaseAdmin
      .from('order_items')
      .select('"itemWorkspace"')
      .eq('id', params.itemId)
      .single();

    const currentWorkspace = (current as any)?.itemWorkspace || {};
    const updatedWorkspace = {
      ...currentWorkspace,
      designWorkflowStatus: 'APPROVED',
      approvalStatus: 'APPROVED',
      approvedBy: approvedByName || approvedBy || 'Customer',
      approvedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('order_items')
      .update({ 'itemWorkspace': updatedWorkspace } as any)
      .eq('id', params.itemId);

    return NextResponse.json({ success: true, status: 'APPROVED' });
  } catch (error: any) {
    console.error('Approve proof error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
