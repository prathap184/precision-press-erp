import { NextRequest, NextResponse } from 'next/server';
import { verifyMasterSync, MasterType } from '@/lib/tally/tally-master-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { masterType } = body as { masterType: MasterType };

    if (!masterType || !['customers', 'suppliers', 'items', 'accounts'].includes(masterType)) {
      return NextResponse.json({ success: false, error: 'Invalid masterType' }, { status: 400 });
    }

    const audit = await verifyMasterSync(masterType);
    return NextResponse.json({ success: true, audit });
  } catch (err: any) {
    console.error('[tally-masters/verify] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Verification failed' }, { status: 500 });
  }
}
