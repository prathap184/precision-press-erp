import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ItemDesignStatus } from '@/types/models';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { orderId: string; itemId: string } }
) {
  try {
    const body = await req.json();
    const { designWorkflowStatus } = body as { designWorkflowStatus: ItemDesignStatus };

    if (!designWorkflowStatus) {
      return NextResponse.json({ error: 'designWorkflowStatus is required' }, { status: 400 });
    }

    // Use fetch-merge-update pattern for JSONB field
    const { data: current } = await supabaseAdmin
      .from('order_items')
      .select('"itemWorkspace"')
      .eq('id', params.itemId)
      .single();

    const currentWorkspace = (current as any)?.itemWorkspace || {};
    const updatedWorkspace = {
      ...currentWorkspace,
      designWorkflowStatus,
      lastUpdatedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from('order_items')
      .update({ 'itemWorkspace': updatedWorkspace } as any)
      .eq('id', params.itemId);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ success: true, designWorkflowStatus });
  } catch (error: any) {
    console.error('Update status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
