// @ts-nocheck
import { v2 as cloudinary } from 'cloudinary';

// Initialize Cloudinary if configured
const isCloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET &&
  process.env.CLOUDINARY_API_SECRET !== '<your_api_secret>' &&
  process.env.CLOUDINARY_API_SECRET !== 'your_api_secret_here';

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * UPLOAD FILE TO CLOUDINARY
 * Folder: precision_press_designs/orders/{orderId}
 */
export async function uploadDesignFile(orderId: string, file: File): Promise<string> {
  if (!isCloudinaryConfigured) {
    throw new Error('Cloudinary is not configured. Please set environment variables.');
  }

  try {
    // Convert File to Buffer
    const buffer = await file.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString('base64');
    const fileUri = `data:${file.type};base64,${base64Data}`;

    const uploadResponse = await cloudinary.uploader.upload(fileUri, {
      folder: `precision_press_designs/orders/${orderId}`,
      resource_type: 'auto',
      fetch_format: 'auto',
      quality: 'auto',
      public_id: `${Date.now()}_${file.name.split('.')[0]}`,
    });

    return uploadResponse.secure_url;
  } catch (error) {
    console.error('Design file upload failed:', error);
    throw new Error(`Failed to upload design file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
