const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
if (privateKey.startsWith('"') && privateKey.endsWith('",')) {
    privateKey = privateKey.substring(1, privateKey.length - 2);
} else if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
}
privateKey = privateKey.replace(/\\n/g, '\n');

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

const db = admin.firestore();

async function main() {
  const snap = await db.collection('profiles').get();
  console.log('Total profiles:', snap.size);
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`UID: ${doc.id} | Email: ${data.email} | Name: ${data.displayName || data.name} | Role: ${data.role} | Roles: ${JSON.stringify(data.roles || [])} | CreditLimit: ${data.creditLimit} | UsedCredit: ${data.usedCredit}`);
  });
  process.exit(0);
}

main();
