import { Redis } from '@upstash/redis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

async function clear() {
  await redis.del('products:v1:list');
  await redis.del('products:v1:hash');
  console.log("Deleted products list and hash from Redis");
}
clear();
