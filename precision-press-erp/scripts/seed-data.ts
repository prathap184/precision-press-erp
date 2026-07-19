/**
 * Usage:
 * npx ts-node scripts/seed-data.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

import { supabaseServer } from '../src/lib/supabase-server';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const timestamp = new Date().toISOString();

const CATEGORIES = [
  {
    id: 'solvent',
    name: 'Solvent Print',
    description: 'Industrial outdoor banners and hoardings with extreme weather resistance.',
    image: 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?w=800',
  },
  {
    id: 'eco-solvent',
    name: 'Eco Solvent Print',
    description: 'High-resolution indoor/outdoor vinyls with precision detail.',
    image: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800',
  },
  {
    id: 'uv-roll',
    name: 'UV Print Roll',
    description: 'Vibrant, textured roll-to-roll printing for walls and premium fabric.',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
  },
  {
    id: 'uv-flat',
    name: 'UV Print Flat',
    description: 'Direct printing on rigid substrate like Sunboard, Acrylic, and Metal.',
    image: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800',
  },
  {
    id: 'digital',
    name: 'Digital Print',
    description: 'Fast commercial paper printing for brochures, cards, and flyers.',
    image: 'https://images.unsplash.com/photo-1586075010633-2442dcbd63a8?w=800',
  },
];

const DEFAULT_PRICING = {
  eyelet: { metal: 2, plastic: 3, none: 0 },
  delivery: { selfPickup: 0, door: 50, courier: 100, transport: 150 },
};

function generateProducts() {
  const groups = [
    { prefix: 6000, category: 'SOLVENT_PRINT', image: CATEGORIES[0].image, baseRate: 6, step: 2, names: ['Sol Frontlit Flex 180', 'Sol Frontlit Flex 240', 'Sol Ministar Flex', 'Sol Bigstar Flex', 'Sol Backlit Standard', 'Sol Backlit Star', 'Sol Vinyl Standard', 'Sol Vinyl Gloss', 'Sol One Way Vision', 'Sol Mesh Banner'] },
    { prefix: 6200, category: 'ECO_SOLVENT', image: CATEGORIES[1].image, baseRate: 12, step: 5, names: ['Eco Vinyl Matte', 'Eco Vinyl Glossy', 'Eco Clear Vinyl', 'Eco Canvas Matte', 'Eco Canvas Glossy', 'Eco Photo Paper', 'Eco Backlit Pet Film', 'Eco Wall Graphics', 'Eco Reflective Vinyl', 'Eco Transparent Sticker'] },
    { prefix: 6400, category: 'UV_ROLL', image: CATEGORIES[2].image, baseRate: 45, step: 10, names: ['UV Backlit Fabric', 'UV Frontlit Fabric', 'UV Metallic Vinyl', 'UV Leatherette', 'UV Wallpaper Textured', 'UV Clear Film Double Layer', 'UV Soft Film', 'UV Canvas Premium', 'UV Blockout Banner', 'UV Translucent Vinyl'] },
    { prefix: 6600, category: 'UV_FLAT_PRINT', image: CATEGORIES[3].image, baseRate: 65, step: 20, names: ['UV Sunboard 3mm', 'UV Sunboard 5mm', 'UV Acrylic Clear 3mm', 'UV Acrylic White 3mm', 'UV ACP Sheet', 'UV Wood MDF 5mm', 'UV Glass Direct', 'UV Metal Sheet', 'UV Tile Print', 'UV Corrugated Sheet'] },
    { prefix: 6800, category: 'DIGITAL_PRINT', image: CATEGORIES[4].image, baseRate: 15, step: 5, names: ['Dig 130gsm Art Paper', 'Dig 170gsm Art Paper', 'Dig 250gsm Art Card', 'Dig 300gsm Art Card', 'Dig Textured Card 280', 'Dig Sticker Paper', 'Dig Envelope Standard', 'Dig Invitation Card', 'Dig Menu Card Laminated', 'Dig Calendar Sheet'] },
  ];

  return groups.flatMap((group) =>
    group.names.map((name, index) => ({
      id: String(group.prefix + index),
      name,
      category: group.category,
      baseRate: group.baseRate + index * group.step,
      eyeletPricing: group.category === 'UV_FLAT_PRINT' || group.category === 'DIGITAL_PRINT' ? { metal: 0, plastic: 0, none: 0 } : DEFAULT_PRICING.eyelet,
      deliveryPricing: DEFAULT_PRICING.delivery,
      status: 'ACTIVE',
      media: { images: [group.image] },
      specs: { description: `${name} for industrial printing.` },
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
  );
}

async function seed() {
  try {
    console.log('🚀 Starting Data Seeding...');

    console.log('📦 Seeding Categories...');
    const { error: categoriesError } = await supabaseServer.from('categories').upsert(CATEGORIES, { onConflict: 'id' });
    if (categoriesError) throw categoriesError;

    console.log('🏷️ Seeding Products...');
    const products = generateProducts();
    const { error: productsError } = await supabaseServer.from('products').upsert(products, { onConflict: 'id' });
    if (productsError) throw productsError;

    console.log('✨ Data Seeding Completed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding Failed:', error);
    process.exit(1);
  }
}

seed();