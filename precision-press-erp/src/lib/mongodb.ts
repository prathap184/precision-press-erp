import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import { MongoClient } from 'mongodb';

const getMongoClientPromise = (): Promise<MongoClient> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Please add your Mongo URI to environment variables (MONGODB_URI).');
  }
  const options = {};
  
  if (process.env.NODE_ENV === 'development') {
    let globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };
    if (!globalWithMongo._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect();
    }
    return globalWithMongo._mongoClientPromise;
  } else {
    const client = new MongoClient(uri, options);
    return client.connect();
  }
};

// Export a lazy thenable object that behaves exactly like a Promise<MongoClient> when awaited,
// but defers connection and environment variable verification until execution.
const clientPromise = {
  then: (onfulfilled?: any, onrejected?: any) => {
    try {
      return getMongoClientPromise().then(onfulfilled, onrejected);
    } catch (err) {
      if (onrejected) {
        return Promise.reject(err).catch(onrejected);
      }
      return Promise.reject(err);
    }
  }
} as unknown as Promise<MongoClient>;

export default clientPromise;

/**
 * Helper to quickly get the database and a collection
 */
export async function getDbCollection(collectionName: string) {
  const client = await clientPromise;
  const db = client.db('precision_press_erp');
  return db.collection(collectionName);
}
