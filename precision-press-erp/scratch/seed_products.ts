import { supabase } from '../src/lib/supabase';
import { collection, doc, setDoc } from '../src/lib/supabase-firestore-shim';

const PRODUCTS = [
  {
    id: '6000',
    name: 'Sol Frontlit Flex 180',
    category: 'solvent',
    categoryName: 'Solvent Print',
    baseRate: 12,
    description: 'The industry standard for high-resolution wide format front-lit displays. Engineered for durability and weather resistance.',
    material: 'Flex',
    specs: { width: '16.4 ft', weight: '510 gsm', fireRating: 'B1 Certified' },
    imageUrl: 'https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&w=800',
    isActive: true
  },
  {
    id: '6001',
    name: 'Sol Frontlit Flex 240',
    category: 'solvent',
    categoryName: 'Solvent Print',
    baseRate: 15,
    description: 'Enhanced thickness for greater tensile strength. Ideal for large-scale outdoor hoardings.',
    material: 'Flex',
    specs: { width: '16.4 ft', weight: '610 gsm', fireRating: 'B2 Certified' },
    imageUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=800',
    isActive: true
  },
  {
    id: '7000',
    name: 'Eco-Vinyl Premium',
    category: 'digital',
    categoryName: 'Digital Print',
    baseRate: 35,
    description: 'High-gloss adhesive vinyl for indoor and decorative use. Vibrant color reproduction.',
    material: 'Vinyl',
    specs: { width: '5 ft', weight: '120 micron', fireRating: 'None' },
    imageUrl: 'https://images.unsplash.com/photo-1586075010633-2442dcbd63a8?auto=format&fit=crop&w=800',
    isActive: true
  },
  {
    id: '8000',
    name: 'UV Fabric Mesh',
    category: 'uv',
    categoryName: 'UV Print',
    baseRate: 55,
    description: 'Breathable fabric for wind-exposed areas. UV-printed for exceptional longevity.',
    material: 'Fabric',
    specs: { width: '10 ft', weight: '280 gsm', fireRating: 'B1' },
    imageUrl: 'https://images.unsplash.com/photo-1517142089942-ba376ce32a2e?auto=format&fit=crop&w=800',
    isActive: true
  }
];

const CATEGORIES = [
  { id: 'solvent', name: 'Solvent Print', description: 'High-speed, cost-effective outdoor printing.', image: 'https://images.unsplash.com/photo-1579546678181-e25f822989cc?w=800' },
  { id: 'digital', name: 'Digital Print', description: 'Precision small-format and specialty prints.', image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800' },
  { id: 'uv', name: 'UV Print', description: 'Ultraviolet-cured prints with superior durability.', image: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=800' },
];

async function seed() {
  console.log('--- SEEDING SYSTEM DATA ---');
  
  // Seed Categories
  for (const cat of CATEGORIES) {
    await setDoc(doc(supabase, 'categories', cat.id), cat);
    console.log(`- Category Seeded: ${cat.name}`);
  }

  // Seed Products
  for (const prod of PRODUCTS) {
    await setDoc(doc(supabase, 'products', prod.id), prod);
    console.log(`- Product Seeded: ${prod.name}`);
  }

  console.log('--- SEEDING COMPLETE ---');
}

seed();
