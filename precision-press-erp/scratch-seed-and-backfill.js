const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

// OpenSSL crash-proof private key parser
let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

if (privateKey.startsWith('"') && privateKey.endsWith('",')) {
    privateKey = privateKey.substring(1, privateKey.length - 2);
} else if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
}
privateKey = privateKey.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  }),
});

const db = admin.firestore();

const CATEGORIES = [
  { id: 'solvent', name: 'Solvent Print', description: 'Industrial outdoor banners and hoardings.', image: '/images/categories/solvent.png' },
  { id: 'eco-solvent', name: 'Eco Solvent Print', description: 'High-resolution indoor/outdoor vinyls.', image: '/images/categories/eco-solvent.png' },
  { id: 'uv-roll', name: 'UV Print Roll', description: 'Vibrant, textured roll-to-roll printing.', image: '/images/categories/uv-roll.png' },
  { id: 'uv-flat', name: 'UV Print Flat', description: 'Direct printing on rigid substrate.', image: '/images/categories/uv-flat.png' },
  { id: 'digital', name: 'Digital Print', description: 'Fast commercial paper printing.', image: '/images/categories/digital.png' },
  { id: 'id-cards', name: 'ID Cards', description: 'Professional PVC and RFID cards.', image: '/images/categories/id-cards.png' },
];

const DEFAULT_PRICING = {
  eyelet: { metal: 2, plastic: 3, none: 0 },
  delivery: { selfPickup: 0, door: 50, courier: 100, transport: 150 }
};

const DEFAULT_WORKFLOW_STEPS = [
  { id: 'step-accountant', label: 'Accounts Approval', role: 'ACCOUNTANT', description: 'Financial verification and order approval', blocking: true },
  { id: 'step-designer',   label: 'Design & Artwork',   role: 'DESIGNER',   description: 'Pre-press design, proofing and artwork preparation', blocking: true },
  { id: 'step-manager',    label: 'Manager Sign-off',   role: 'MANAGER',    description: 'Quality check and production authorization', blocking: true },
  { id: 'step-printer',    label: 'Printing',           role: 'PRINTER',    description: 'Production printing run', blocking: true },
  { id: 'step-pasting',    label: 'Pasting / Finishing',role: 'PASTING',    description: 'Post-print finishing, lamination and pasting', blocking: false },
  { id: 'step-dispatch',   label: 'Dispatch',           role: 'DISPATCH',   description: 'Pack, label and hand-over for delivery', blocking: true },
  { id: 'step-delivery',   label: 'Delivery',           role: 'DELIVERY',   description: 'Final delivery to customer site', blocking: false },
];

function getStepIndexForStatus(status) {
  const map = {
    'PLACED':               0,
    'ON_HOLD':              0,
    'ACCOUNTANT_APPROVED':  1,
    'DESIGNING':            1,
    'DESIGN_READY':         2,
    'PAYMENT_PENDING':      2,
    'PAYMENT_VERIFIED':     2,
    'ASSIGNED':             3,
    'IN_PROGRESS':          3,
    'PRODUCTION_PAUSED':    3,
    'COMPLETED':            5,
    'DISPATCHED':           6,
    'IN_TRANSIT':           6,
    'DELIVERED':            6,
    'CANCELLED':            0,
    'REJECTED':             0,
  };
  return map[status] ?? 0;
}

function getStepStatusForOrderStatus(status) {
  if (['COMPLETED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED'].includes(status)) return 'COMPLETED';
  if (['IN_PROGRESS', 'DESIGNING'].includes(status)) return 'IN_PROGRESS';
  if (['CANCELLED', 'REJECTED'].includes(status)) return 'REJECTED';
  return 'PENDING';
}

async function main() {
  try {
    console.log('--- SEEDING START ---');
    
    // Seed Categories
    for (const cat of CATEGORIES) {
      await db.collection('categories').doc(cat.id).set(cat);
      console.log(`Seeded Category: ${cat.id}`);
    }

    const categories = [
      { id: 'SOLVENT', base: 6, step: 2, prefix: '6000', names: ['Sol Frontlit Flex 180', 'Sol Frontlit Flex 240', 'Sol Ministar Flex', 'Sol Bigstar Flex', 'Sol Backlit Standard', 'Sol Backlit Star', 'Sol Vinyl Standard', 'Sol Vinyl Gloss', 'Sol One Way Vision', 'Sol Mesh Banner'] },
      { id: 'ECO_SOLVENT', base: 12, step: 5, prefix: '6200', names: ['Eco Vinyl Matte', 'Eco Vinyl Glossy', 'Eco Clear Vinyl', 'Eco Canvas Matte', 'Eco Canvas Glossy', 'Eco Photo Paper', 'Eco Backlit Pet Film', 'Eco Wall Graphics', 'Eco Reflective Vinyl', 'Eco Transparent Sticker'] },
      { id: 'UV_ROLL', base: 45, step: 10, prefix: '6400', names: ['UV Backlit Fabric', 'UV Frontlit Fabric', 'UV Metallic Vinyl', 'UV Leatherette', 'UV Wallpaper Textured', 'UV Clear Film Double Layer', 'UV Soft Film', 'UV Canvas Premium', 'UV Blockout Banner', 'UV Translucent Vinyl'] },
      { id: 'UV_FLAT', base: 65, step: 20, prefix: '6600', names: ['UV Sunboard 3mm', 'UV Sunboard 5mm', 'UV Acrylic Clear 3mm', 'UV Acrylic White 3mm', 'UV ACP Sheet', 'UV Wood MDF 5mm', 'UV Glass Direct', 'UV Metal Sheet', 'UV Tile Print', 'UV Corrugated Sheet'] },
      { id: 'DIGITAL', base: 15, step: 5, prefix: '6800', names: ['Dig 130gsm Art Paper', 'Dig 170gsm Art Paper', 'Dig 250gsm Art Card', 'Dig 300gsm Art Card', 'Dig Textured Card 280', 'Dig Sticker Paper', 'Dig Envelope Standard', 'Dig Invitation Card', 'Dig Menu Card Laminated', 'Dig Calendar Sheet'] },
      { id: 'ID_CARDS', base: 25, step: 10, prefix: '7000', names: ['Student ID Card', 'Employee RFID Card', 'Visitor Pass', 'VIP Membership Card', 'Loyalty Card Gloss', 'Event Access Card', 'Smart Proximity Card', 'Printed Lanyard Set', 'Card Holder Clear', 'Card Yo-Yo Retractor'] }
    ];

    let productsSeeded = 0;
    for (const group of categories) {
      for (let i = 0; i < group.names.length; i++) {
        const prodId = (parseInt(group.prefix) + i).toString();
        await db.collection('products').doc(prodId).set({
          id: prodId,
          name: group.names[i],
          category: group.id,
          baseRate: group.base + (i * group.step),
          eyeletPricing: group.id === 'UV_FLAT' || group.id === 'DIGITAL' || group.id === 'ID_CARDS' ? { metal: 0, plastic: 0, none: 0 } : DEFAULT_PRICING.eyelet,
          deliveryPricing: DEFAULT_PRICING.delivery,
          status: 'ACTIVE',
          workflowSteps: DEFAULT_WORKFLOW_STEPS,
          media: { images: [`/images/categories/${group.id.toLowerCase().replace('_', '-')}.png`] },
          specs: { description: `${group.names[i]} for industrial printing.` },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        productsSeeded++;
      }
    }
    console.log(`Seeded ${productsSeeded} products with workflow configurations successfully.`);

    console.log('\n--- BACKFILLING ORDERS START ---');
    const ordersSnap = await db.collection('orders').get();
    console.log(`Found ${ordersSnap.size} total orders.`);
    
    let ordersPatched = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const docSnap of ordersSnap.docs) {
      const data = docSnap.data();
      
      // Patch ALL orders if they don't have a valid workflowSnapshot or currentWorkflowRole
      if (!data.workflowSnapshot || !data.workflowSnapshot.steps || !data.currentWorkflowRole) {
        const status = data.status || 'PLACED';
        const currentStepIndex = getStepIndexForStatus(status);
        const stepStatus = getStepStatusForOrderStatus(status);

        const steps = DEFAULT_WORKFLOW_STEPS.map((step, idx) => ({
          ...step,
          status: idx < currentStepIndex ? 'COMPLETED' : idx === currentStepIndex ? stepStatus : 'LOCKED',
          startedAt: idx <= currentStepIndex ? (data.createdAt || admin.firestore.Timestamp.now()) : undefined,
          completedAt: idx < currentStepIndex ? (data.updatedAt || admin.firestore.Timestamp.now()) : undefined,
          completedBy: idx < currentStepIndex ? 'SYSTEM_BACKFILL' : undefined,
          notes: idx < currentStepIndex ? 'Auto-backfilled from legacy order status.' : '',
        }));

        const workflowSnapshot = {
          steps,
          currentStepIndex,
          templateId: 'default-7-stage',
          version: 1,
        };

        const currentRole = DEFAULT_WORKFLOW_STEPS[currentStepIndex]?.role ?? null;
        const currentLabel = DEFAULT_WORKFLOW_STEPS[currentStepIndex]?.label ?? null;

        batch.update(docSnap.ref, {
          workflowSnapshot,
          currentWorkflowRole: currentRole,
          currentWorkflowLabel: currentLabel,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batchCount++;
        ordersPatched++;

        console.log(`Patching Order [${docSnap.id}] status=${status} -> stepIdx=${currentStepIndex} role=${currentRole}`);

        if (batchCount >= 490) {
          await batch.commit();
          console.log(`Committed partial batch of ${batchCount} orders.`);
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${batchCount} orders.`);
    }

    console.log(`\nSuccess! Seeded ${productsSeeded} products and patched ${ordersPatched} legacy orders.`);
    process.exit(0);
  } catch (error) {
    console.error('Execution Failed:', error);
    process.exit(1);
  }
}

main();
