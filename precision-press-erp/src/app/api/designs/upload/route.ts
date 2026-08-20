import { NextRequest, NextResponse } from 'next/server';
import { uploadToCloudinary } from '@/lib/cloudinary';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabaseServer } from '@/lib/supabase-server';

// ─── Magic Byte Signatures ─────────────────────────────────────────────────────
const MAGIC_SIGNATURES: { sig: number[]; mime: string; ext: string }[] = [
  { sig: [0x25, 0x50, 0x44, 0x46],             mime: 'application/pdf', ext: 'pdf' },
  { sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png', ext: 'png' },
  { sig: [0xff, 0xd8, 0xff],                   mime: 'image/jpeg', ext: 'jpg' },
  { sig: [0x49, 0x49, 0x2a, 0x00],             mime: 'image/tiff', ext: 'tif' }, // TIFF LE
  { sig: [0x4d, 0x4d, 0x00, 0x2a],             mime: 'image/tiff', ext: 'tif' }, // TIFF BE
  { sig: [0x52, 0x49, 0x46, 0x46],             mime: 'image/webp', ext: 'webp' }, // also AVI/WAV – check bytes 8-11
  { sig: [0x47, 0x49, 0x46, 0x38],             mime: 'image/gif', ext: 'gif' },
];

const ALLOWED_MIMES = new Set(['image/png','image/jpeg','image/webp','image/tiff','image/gif','application/pdf']);

function detectMagicMime(buffer: Buffer): string | null {
  for (const { sig, mime } of MAGIC_SIGNATURES) {
    const slice = buffer.slice(0, sig.length);
    const match = sig.every((byte, i) => slice[i] === byte);
    if (match) {
      // WEBP extra check: bytes 8-11 must be 0x57 0x45 0x42 0x50
      if (mime === 'image/webp') {
        const riffExtra = buffer.slice(8, 12);
        if (
          riffExtra[0] === 0x57 && riffExtra[1] === 0x45 &&
          riffExtra[2] === 0x42 && riffExtra[3] === 0x50
        ) return mime;
        continue;
      }
      return mime;
    }
  }
  return null;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkRateLimit('file_upload', 20, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many upload requests. Please try again later.' }, { status: 429 });
    }

    // ─── Authentication Check (Optional / Permissive for ERP staff uploads) ──
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { adminAuth } = await import('@/lib/firebase-admin');
        const idToken = authHeader.split('Bearer ')[1];
        await adminAuth.verifyIdToken(idToken);
      } catch (e) {
        // Token invalid, but proceed for ERP internal uploads
        console.warn('Firebase token verification failed on upload, proceeding with internal upload');
      }
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const filename = file.name;
    const originalType = file.type;
    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    const originalSize = rawBuffer.length;

    // ─── 1. Flexible MIME & Extension Validation ─────────────────────────────
    let detectedMime = detectMagicMime(rawBuffer);
    if (!detectedMime) {
      // Fallback to filename extension or provided type
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      if (['jpg', 'jpeg'].includes(ext)) detectedMime = 'image/jpeg';
      else if (ext === 'png') detectedMime = 'image/png';
      else if (['tif', 'tiff'].includes(ext)) detectedMime = 'image/tiff';
      else if (ext === 'webp') detectedMime = 'image/webp';
      else if (ext === 'gif') detectedMime = 'image/gif';
      else if (ext === 'pdf') detectedMime = 'application/pdf';
      else if (ext === 'psd') detectedMime = 'image/vnd.adobe.photoshop';
      else if (ext === 'ai') detectedMime = 'application/illustrator';
      else if (ext === 'cdr') detectedMime = 'application/coreldraw';
      else if (ext === 'svg') detectedMime = 'image/svg+xml';
      else if (ext === 'zip') detectedMime = 'application/zip';
      else if (ext === 'rar') detectedMime = 'application/x-rar-compressed';
      else detectedMime = originalType || 'application/octet-stream';
    }

    // ─── 2. Duplicate Detection (SHA-256 hash) ────────────────────────────────
    const fileHash = sha256(rawBuffer);
    try {
      const { data: existingFile } = await supabaseServer
        .from('design_revisions')
        .select('url, cloudinary_public_id')
        .eq('sha256_hash', fileHash)
        .maybeSingle();

      if (existingFile?.url) {
        return NextResponse.json({
          success: true,
          fileId: existingFile.cloudinary_public_id,
          fileUrl: existingFile.url,
          filename,
          contentType: detectedMime,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: '100.0%',
          storeMethod: 'cached',
          cloudinaryFolder: 'cached',
          cloudinaryPublicId: existingFile.cloudinary_public_id,
          deduplicated: true,
          sha256: fileHash,
        });
      }
    } catch (e) {
      console.warn('Duplicate check skipped:', e);
    }

    let buffer = rawBuffer;

    let targetContentType = detectedMime;
    let processedBuffer: any = buffer;

    // 3. Image Optimisation & Compression (using sharp)
    if (originalType.startsWith('image/')) {
      try {
        processedBuffer = await sharp(buffer)
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        targetContentType = 'image/webp';
      } catch (sharpError) {
        console.error('Sharp image processing failed, using raw buffer:', sharpError);
      }
    }

    // 2. Compute Cloudinary folder:
    //    - If orderId + itemId provided → isolated per-item folder
    //    - If only orderId → order-level folder
    //    - If custom folder field → use that
    //    - Default → precision_press_designs
    const orderId = formData.get('orderId')?.toString();
    const itemId  = formData.get('itemId')?.toString();
    const customFolder = formData.get('folder')?.toString();

    let folder: string;
    if (orderId && itemId) {
      folder = `designs/${orderId}/${itemId}`;
    } else if (orderId) {
      folder = `designs/${orderId}`;
    } else if (customFolder) {
      folder = customFolder;
    } else {
      folder = 'precision_press_designs';
    }

    let fileUrl = '';
    let fileId = '';
    let cloudinaryFolder = folder;
    let storeMethod = 'cloudinary';

    try {
      const cloudinaryResult = await uploadToCloudinary(processedBuffer, targetContentType, folder);
      if (cloudinaryResult) {
        fileUrl = cloudinaryResult.url;
        fileId = cloudinaryResult.publicId;
      } else {
        throw new Error('Cloudinary upload returned null');
      }
    } catch (cloudinaryError) {
      console.warn('Cloudinary upload failed, using local storage fallback:', cloudinaryError);
      
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      const fileExt = targetContentType.split('/').pop() || 'bin';
      const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = path.join(uploadDir, uniqueFilename);
      
      fs.writeFileSync(filePath, processedBuffer);
      fileUrl = `/uploads/${uniqueFilename}`;
      fileId = uniqueFilename;
      cloudinaryFolder = 'local';
      storeMethod = 'local';
    }

    return NextResponse.json({
      success: true,
      fileId,
      fileUrl,
      filename,
      contentType: targetContentType,
      originalSize,
      compressedSize: processedBuffer.length,
      compressionRatio: ((processedBuffer.length / originalSize) * 100).toFixed(1) + '%',
      storeMethod,
      cloudinaryFolder,
      cloudinaryPublicId: fileId,
      sha256: fileHash,
    });
  } catch (error: any) {
    console.error('Upload API Error:', error);
    return NextResponse.json({ error: error.message || 'Server error during upload' }, { status: 500 });
  }
}
