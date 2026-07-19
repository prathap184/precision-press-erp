require('dotenv').config({ path: '.env.local' });
const { db } = require('./src/lib/firebase-admin');

async function test() {
  const users = await db.collection('users').get();
  users.forEach(u => console.log(u.id, u.data().email, u.data().name));
}

test();
