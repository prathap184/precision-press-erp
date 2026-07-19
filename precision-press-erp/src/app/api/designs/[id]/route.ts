import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import zlib from 'zlib';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!id) {
      return new NextResponse('Invalid ID', { status: 400 });
    }

    let doc: any = null;

    if (id.startsWith('fs_')) {
      // 1. Fetch directly from Firestore fallback storage
      const { adminDb } = await import('@/lib/firebase-admin');
      const snap = await adminDb.collection('backup_designs').doc(id).get();
      if (snap.exists) {
        doc = snap.data();
      }
    } else {
      // 2. Try fetching from MongoDB first
      try {
        if (ObjectId.isValid(id)) {
          const client = await clientPromise;
          const db = client.db('precision_press_erp');
          doc = await db.collection('designs').findOne({ _id: new ObjectId(id) });
        }
      } catch (dbError) {
        console.warn('MongoDB query failed during download, checking Firestore backup storage:', dbError);
      }

      // If not found in MongoDB or connection failed, attempt to find in Firestore fallback
      if (!doc) {
        const { adminDb } = await import('@/lib/firebase-admin');
        const snap = await adminDb.collection('backup_designs').doc(id).get();
        if (snap.exists) {
          doc = snap.data();
        }
      }
    }

    if (!doc) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // 3. Decompress zlib-compressed binary data
    let compressedBuffer: Buffer;
    if (doc.dataBase64) {
      compressedBuffer = Buffer.from(doc.dataBase64, 'base64');
    } else {
      const rawData = doc.data;
      compressedBuffer = rawData.buffer || rawData;
    }

    const decompressedBuffer = zlib.gunzipSync(compressedBuffer);

    // 2. Stream back with original content type and caching
    return new NextResponse(decompressedBuffer, {
      headers: {
        'Content-Type': doc.contentType || 'application/octet-stream',
        'Content-Length': decompressedBuffer.length.toString(),
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400', // Premium caching settings
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename)}"`,
      },
    });
  } catch (error: any) {
    console.error('Download API Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
