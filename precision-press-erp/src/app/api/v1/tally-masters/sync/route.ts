import { NextRequest, NextResponse } from 'next/server';
import { previewMasterSync, executeMasterSync, getMasterSummaryCounts, MasterType } from '@/lib/tally/tally-master-service';

export async function GET() {
  try {
    const summary = await getMasterSummaryCounts();
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error('[tally-masters/summary] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { masterType, action } = body as { masterType: MasterType; action: 'preview' | 'execute' };

    if (!masterType || !['customers', 'suppliers', 'items', 'accounts'].includes(masterType)) {
      return NextResponse.json({ success: false, error: 'Invalid masterType' }, { status: 400 });
    }

    if (action === 'preview') {
      const preview = await previewMasterSync(masterType);
      return NextResponse.json({ success: true, preview });
    }

    if (action === 'execute') {
      const result = await executeMasterSync(masterType);
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ success: false, error: 'Invalid action. Must be preview or execute' }, { status: 400 });
  } catch (err: any) {
    console.error('[tally-masters/sync] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Sync failed' }, { status: 500 });
  }
}
