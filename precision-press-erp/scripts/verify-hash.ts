import { redis } from '../src/lib/cache/redis';

async function run() {
  if (!redis) {
    console.error("Redis is not connected.");
    process.exit(1);
  }

  console.log("=== Redis Hash Verification ===");
  try {
    const type = await redis.type('products:v1:hash');
    console.log(`TYPE products:v1:hash => ${type}`);
  } catch (e: any) {
    console.log(`TYPE products:v1:hash => Error: ${e.message}`);
  }

  try {
    const hlen = await redis.hlen('products:v1:hash');
    console.log(`HLEN products:v1:hash => ${hlen}`);
  } catch (e: any) {
    console.log(`HLEN products:v1:hash => Error: ${e.message}`);
  }

  try {
    const hashData = await redis.hgetall('products:v1:hash');
    console.log("HGETALL sample keys:", hashData ? Object.keys(hashData).slice(0, 5) : null);
  } catch (e: any) {
    console.log(`HGETALL products:v1:hash => Error: ${e.message}`);
  }

  process.exit(0);
}

run().catch(console.error);
