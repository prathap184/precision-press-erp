import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// Create a singleton Redis instance if valid credentials exist
export const redis = (url && token && !url.includes('mock.upstash.io')) 
  ? new Redis({ url, token }) 
  : null;
