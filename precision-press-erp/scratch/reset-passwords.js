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

const auth = admin.auth();

const usersToReset = [
  { email: 'admin@gmail.com', uid: 'hU2veEFClcPc3oqOng9oJZrVgdc2' },
  { email: 'accountant2@gmail.com', uid: 'VByOqdHmepcOrmxpkq2ljYpuycU2' },
  { email: 'designer2@gmail.com', uid: 'V9SBgiT7wvarfgFl0R8Jx2HpVRX2' },
  { email: 'printer@gmail.com', uid: 'RrL9ka3hIcfyEgwRTT5vxwH42Wv1' },
  { email: 'dispatchdd@gmail.com', uid: '4kgSh9dFpVRo6Iuj4mjIpwNGjIw2' },
  { email: 'customer@gmail.com', uid: 'Q82ru21IQWcFrt6YQmurJ9nyeej2' }
];

async function main() {
  for (const user of usersToReset) {
    try {
      await auth.updateUser(user.uid, { password: 'password123' });
      console.log(`Successfully reset password for ${user.email} (UID: ${user.uid}) to password123`);
    } catch (error) {
      console.error(`Failed to reset password for ${user.email}:`, error);
    }
  }
  process.exit(0);
}

main();
