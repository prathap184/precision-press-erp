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

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  }),
});

const db = admin.firestore();

async function main() {
  const profilesSnap = await db.collection('profiles').get();
  console.log(`Found ${profilesSnap.size} profiles:`);
  profilesSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    console.log(`UID: ${docSnap.id}`);
    console.log(`  Name: ${data.name}`);
    console.log(`  Email: ${data.email}`);
    console.log(`  Role: ${data.role}`);
    console.log(`  Roles: ${JSON.stringify(data.roles)}`);
    console.log(`  Status: ${data.status}`);
    console.log('-----------------------------');
  });
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
