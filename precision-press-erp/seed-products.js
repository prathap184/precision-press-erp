const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

// OpenSSL crash-proof private key parser
let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

// Clean up weird env injections
if (privateKey.startsWith('"') && privateKey.endsWith('",')) {
    privateKey = privateKey.substring(1, privateKey.length - 2);
} else if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
}

// Ensure linebreaks are actual newlines
privateKey = privateKey.replace(/\\n/g, '\n');

console.log("Key Validation Start Segment:", privateKey.substring(0, 35));
console.log("Key Validation End Segment:", privateKey.substring(privateKey.length - 35));

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  }),
});

const db = admin.firestore();

const dummyProducts = [
  {
    id: "6000",
    name: "Sol Frontlit Flex 180",
    category: "SOLVENT_PRINT",
    baseRate: 15.5,
    eyeletPricing: { metal: 2.0, plastic: 1.5, none: 0 },
    deliveryPricing: { selfPickup: 0, door: 150, courier: 250, transport: 350 },
    media: { images: ["/placeholder.jpg"] },
    specs: { maxWidth: "10ft", gsm: "280", description: "Standard frontlit flex for banners" },
    status: "ACTIVE",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: "6001",
    name: "Sol Star Flex 320",
    category: "SOLVENT_PRINT",
    baseRate: 25.0,
    eyeletPricing: { metal: 2.0, plastic: 1.5, none: 0 },
    deliveryPricing: { selfPickup: 0, door: 150, courier: 300, transport: 400 },
    media: { images: ["/placeholder.jpg"] },
    specs: { maxWidth: "10ft", gsm: "320", description: "Premium star flex for hoarding" },
    status: "ACTIVE",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: "6002",
    name: "Eco Vinyl Gloss",
    category: "ECO_SOLVENT_PRINT",
    baseRate: 90.0,
    eyeletPricing: { metal: 0, plastic: 0, none: 0 }, // no eyelets for vinyl generally
    deliveryPricing: { selfPickup: 0, door: 100, courier: 200, transport: 300 },
    media: { images: ["/placeholder.jpg"] },
    specs: { maxWidth: "4ft", gsm: "120", description: "Glossy vinyl with vivid print" },
    status: "ACTIVE",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: "6003",
    name: "UV Sunboard 3mm",
    category: "UV_PRINT",
    baseRate: 120.0,
    eyeletPricing: { metal: 0, plastic: 0, none: 0 },
    deliveryPricing: { selfPickup: 0, door: 200, courier: 500, transport: 600 },
    media: { images: ["/placeholder.jpg"] },
    specs: { maxWidth: "8x4ft", gsm: "3mm", description: "Direct UV print on 3mm sunboard" },
    status: "ACTIVE",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }
];

async function seed() {
  console.log("Starting bulk product seed...");
  let count = 0;
  for (const p of dummyProducts) {
    await db.collection("products").doc(p.id).set(p);
    console.log(`Added: [${p.id}] ${p.name}`);
    count++;
  }
  console.log(`Successfully added ${count} dummy products!`);
}

seed().then(() => process.exit(0)).catch(err => {
    console.error("SEEDING FAILED:");
    console.error(err);
    process.exit(1);
});
