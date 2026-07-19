import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const snap = await adminDb.collection('tally_sync_queue').where('status', '==', 'FAILED').get();
    const batch = adminDb.batch();
    snap.docs.forEach(doc => {
      batch.update(doc.ref, { status: 'PENDING', retryCount: 0 });
    });
    await batch.commit();
    return NextResponse.json({ success: true, reset: snap.size });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
