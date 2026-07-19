import { NextRequest, NextResponse } from 'next/server';
import { addDesignProof, getLatestProofVersion, getLatestRevisionVersion } from '@/lib/design-workspace-db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, itemId, url, cloudinaryPublicId, sentBy, sentByName, notes } = body;

    if (!orderId || !itemId || !url || !sentBy) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const latestProofVersion = await getLatestProofVersion(orderId, itemId);
    const latestRevisionVersion = await getLatestRevisionVersion(orderId, itemId);
    const newVersion = latestProofVersion + 1;

    const proof = await addDesignProof({
      orderId,
      itemId,
      version: newVersion,
      revisionVersion: latestRevisionVersion,
      url,
      cloudinaryPublicId: cloudinaryPublicId || '',
      sentBy,
      sentByName: sentByName || '',
      notes,
    });

    return NextResponse.json({ success: true, proof, version: newVersion });
  } catch (error: any) {
    console.error('Add proof error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
