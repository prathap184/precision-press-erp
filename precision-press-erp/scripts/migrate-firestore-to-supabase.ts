import { adminDb } from '../src/lib/firebase-admin';
import { supabase } from '../src/lib/supabase';

async function migrateProducts() {
  console.log('Migrating products from Firestore to Supabase...');
  
  const snapshot = await adminDb.collection('products').get();
  console.log(`Found ${snapshot.docs.length} products to migrate.`);

  let successCount = 0;
  let errorCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Check if it already exists
    const { data: existing } = await supabase.from('products').select('id').eq('id', doc.id).single();
    if (existing) {
      console.log(`Product ${doc.id} already exists in Supabase. Skipping.`);
      continue;
    }

    const newProduct = {
      id: doc.id,
      name: data.name,
      name_lowercase: data.name?.toLowerCase() || '',
      category: data.category,
      printer_category: data.printerCategory || null,
      status: data.status || 'ACTIVE',
      base_rate: data.baseRate || 0,
      eyelet_metal: data.eyeletPricing?.metal || 0,
      eyelet_plastic: data.eyeletPricing?.plastic || 0,
      delivery_door: data.deliveryPricing?.door || 0,
      delivery_courier: data.deliveryPricing?.courier || 0,
      delivery_transport: data.deliveryPricing?.transport || 0,
      media_images: data.media?.images || [],
      media_video_url: data.media?.video?.url || null,
      specs_max_width: data.specs?.maxWidth || null,
      specs_gsm: data.specs?.gsm || null,
      specs_description: data.specs?.description || null,
      workflow_steps: data.workflowSteps || [],
      created_at: data.createdAt ? new Date(data.createdAt._seconds * 1000).toISOString() : new Date().toISOString(),
      updated_at: data.updatedAt ? new Date(data.updatedAt._seconds * 1000).toISOString() : new Date().toISOString()
    };

    const { error } = await supabase.from('products').insert([newProduct]);
    if (error) {
      console.error(`Failed to migrate product ${doc.id}:`, error);
      errorCount++;
    } else {
      successCount++;
    }
  }

  console.log(`Migration Complete. Success: ${successCount}, Errors: ${errorCount}`);
}

migrateProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
