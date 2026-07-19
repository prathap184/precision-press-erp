// @ts-nocheck
import { v2 as cloudinary } from 'cloudinary';

// Check if Cloudinary environment variables are available and not placeholder values
const isConfigured = 
  process.env.CLOUDINARY_CLOUD_NAME && 
  process.env.CLOUDINARY_API_KEY && 
  process.env.CLOUDINARY_API_SECRET && 
  process.env.CLOUDINARY_API_SECRET !== '<your_api_secret>' &&
  process.env.CLOUDINARY_API_SECRET !== 'your_api_secret_here';

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.log('Cloudinary not configured or utilizing placeholder credentials. Falling back to local storage methods.');
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

/**
 * Uploads a buffer to Cloudinary using a Base64 data URI wrapper.
 * Returns the secure URL and public ID of the uploaded asset, or null if configuration is incomplete.
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  mimeType: string,
  folder: string = 'precision_press_designs'
): Promise<CloudinaryUploadResult | null> {
  if (!isConfigured) {
    return null;
  }

  try {
    const base64Data = buffer.toString('base64');
    const fileUri = `data:${mimeType};base64,${base64Data}`;

    const isImageOrVideo = mimeType.startsWith('image/') || mimeType.startsWith('video/');

    const uploadOptions: any = {
      folder,
      resource_type: 'auto', // 'auto' correctly processes images, PDFs, etc.
    };

    if (isImageOrVideo) {
      uploadOptions.fetch_format = 'auto';
      uploadOptions.quality = 'auto';
    }

    const uploadResponse = await cloudinary.uploader.upload(fileUri, uploadOptions);

    return {
      url: uploadResponse.secure_url,
      publicId: uploadResponse.public_id
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null; // Gracefully fall back to local storage methods if upload fails
  }
}
