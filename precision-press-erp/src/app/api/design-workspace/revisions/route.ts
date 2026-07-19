import { NextRequest, NextResponse } from 'next/server';
import { addDesignRevision, getLatestRevisionVersion } from '@/lib/design-workspace-db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, itemId, url, cloudinaryPublicId, cloudinaryFolder, uploadedBy, uploadedByName, notes, uploadStats } = body;

    if (!orderId || !itemId || !url || !uploadedBy) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const latestVersion = await getLatestRevisionVersion(orderId, itemId);
    const newVersion = latestVersion + 1;

    const revision = await addDesignRevision({
      orderId,
      itemId,
      version: newVersion,
      url,
      cloudinaryPublicId: cloudinaryPublicId || '',
      cloudinaryFolder: cloudinaryFolder || `designs/${orderId}/${itemId}`,
      uploadedBy,
      uploadedByName: uploadedByName || '',
      notes,
      revisionType: newVersion === 1 ? 'INITIAL' : 'CORRECTION',
      uploadStats,
    });

    return NextResponse.json({ success: true, revision, version: newVersion });
  } catch (error: any) {
    console.error('Add revision error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
