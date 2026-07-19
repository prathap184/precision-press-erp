import { NextRequest, NextResponse } from 'next/server';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { supabaseAdmin } from '@/lib/supabase-admin';
import sharp from 'sharp';

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string; itemId: string } }
) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const uploadedBy = formData.get('uploadedBy')?.toString() || 'customer';
    const uploadedByName = formData.get('uploadedByName')?.toString() || 'Customer';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const originalSize = buffer.length;
    const originalType = file.type;

    let processedBuffer: Buffer = buffer;
    let targetContentType = originalType;

    if (originalType.startsWith('image/')) {
      try {
        processedBuffer = await sharp(buffer)
          .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 90 }) // higher quality for customer originals
          .toBuffer();
        targetContentType = 'image/webp';
      } catch {}
    }

    // Customer uploads go to a dedicated sub-folder
    const folder = `designs/${params.orderId}/${params.itemId}/customer`;

    let fileUrl = '';
    let fileId = '';

    const cloudinaryResult = await uploadToCloudinary(processedBuffer, targetContentType, folder);
    if (cloudinaryResult) {
      fileUrl = cloudinaryResult.url;
      fileId = cloudinaryResult.publicId;
    } else {
      return NextResponse.json({ error: 'Upload failed — Cloudinary not configured' }, { status: 500 });
    }

    // Update order_items: set customerUploadUrl (NEVER overwrite once set) and update status
    const { data: currentItem } = await supabaseAdmin
      .from('order_items')
      .select('"itemWorkspace", "fileUrl"')
      .eq('id', params.itemId)
      .single();

    const currentWorkspace = (currentItem as any)?.itemWorkspace || {};

    // IMPORTANT: preserve original fileUrl — never overwrite
    // Only set customerUploadUrl if not already set
    const isFirstUpload = !currentWorkspace.customerUploadUrl;

    const updatedWorkspace = {
      ...currentWorkspace,
      designWorkflowStatus: 'UPLOADED_BY_CUSTOMER',
      customerUploadUrl: isFirstUpload ? fileUrl : currentWorkspace.customerUploadUrl, // preserve original
      customerUploadedAt: isFirstUpload ? new Date().toISOString() : currentWorkspace.customerUploadedAt,
      lastUpdatedAt: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('order_items')
      .update({
        'itemWorkspace': updatedWorkspace,
        // fileUrl is NEVER modified here — customer original is preserved
      } as any)
      .eq('id', params.itemId);

    return NextResponse.json({
      success: true,
      fileUrl,
      fileId,
      folder,
      originalPreserved: !isFirstUpload,
      designWorkflowStatus: 'UPLOADED_BY_CUSTOMER',
      originalSize,
      compressedSize: processedBuffer.length,
    });
  } catch (error: any) {
    console.error('Customer upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
