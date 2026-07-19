const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { v2: cloudinary } = require('cloudinary');
require('dotenv').config({ path: '.env.local' });

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

console.log('--- Cloudinary Diagnostic Test ---');
console.log('Cloud Name:', cloudName);
console.log('API Key:', apiKey);
console.log('API Secret:', apiSecret ? (apiSecret.includes('your_api_secret') || apiSecret === '<your_api_secret>' ? '[Placeholder - Needs Replacement!]' : '*** (Set)') : 'undefined');

if (!cloudName || !apiKey || !apiSecret || apiSecret === '<your_api_secret>') {
  console.log('\n⚠️  Cloudinary is not fully configured yet!');
  console.log('To activate Cloudinary:');
  console.log('1. Open .env.local');
  console.log('2. Replace <your_api_secret> with your actual API Secret from the Cloudinary Dashboard');
  process.exit(0);
}

cloudinary.config({ 
  cloud_name: cloudName, 
  api_key: apiKey, 
  api_secret: apiSecret 
});

async function run() {
  try {
    console.log('\nAttempting sample image upload...');
    const uploadResult = await cloudinary.uploader.upload(
      'https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg', 
      {
        folder: 'precision_press_test',
        public_id: 'shoes_test',
      }
    );
    console.log('✅ Upload successful!');
    console.log('Asset URL:', uploadResult.secure_url);
    console.log('Format:', uploadResult.format);
    console.log('Bytes:', uploadResult.bytes);
  } catch (error) {
    console.error('❌ Upload failed:', error.message || error);
  }
}

run();
