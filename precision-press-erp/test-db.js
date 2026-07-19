const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

const uri = process.env.MONGODB_URI;
console.log('Using URI:', uri ? uri.replace(/:([^@]+)@/, ':****@') : 'undefined');

if (!uri) {
  console.error('Error: MONGODB_URI is not set in .env.local');
  process.exit(1);
}

const client = new MongoClient(uri);

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('Connected successfully!');
    const db = client.db('precision_press_erp');
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.close();
  }
}

run();
