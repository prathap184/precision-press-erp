import { NextRequest, NextResponse } from 'next/server';
import { addDesignComment } from '@/lib/design-workspace-db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, itemId, message, authorId, authorName, authorRole, attachmentUrl } = body;

    if (!orderId || !itemId || !message || !authorId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const comment = await addDesignComment({ orderId, itemId, message, authorId, authorName: authorName || '', authorRole: authorRole || '', attachmentUrl });
    return NextResponse.json({ success: true, comment });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
