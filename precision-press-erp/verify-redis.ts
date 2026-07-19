import { Redis } from '@upstash/redis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

async function verify() {
  const list = await redis.get('products:v1:list');
  console.log("Is products list in redis?", !!list);
  if (list) {
     const arr = list as any[];
     console.log("First product in list workflow:", arr[0]?.workflowSteps);
  }
  
  const hash = await redis.hget('products:v1:hash', '6000');
  console.log("Hash for 6000 workflow:", (hash as any)?.workflowSteps);
}
verify();
