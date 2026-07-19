import { Redis } from '@upstash/redis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

async function run() {
  const keys = await redis.keys('*');
  console.log(`Total Keys in Redis: ${keys.length}`);
  console.log(`Keys:`, keys);
}

run().catch(console.error);
