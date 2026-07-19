export const CACHE_VERSION = 'v2';

export const CACHE_KEYS = {
  PRODUCTS_LIST: `products:${CACHE_VERSION}:list`,
  PRODUCTS_HASH: `products:${CACHE_VERSION}:hash`,
  PRODUCT: (id: string) => `product:${CACHE_VERSION}:${id}`,
  WORKFLOW: (productId: string) => `workflow:${CACHE_VERSION}:${productId}`,
  CATEGORIES: `categories:${CACHE_VERSION}`,
  ROLES: `roles:${CACHE_VERSION}`,
  PERMISSIONS: `permissions:${CACHE_VERSION}`,
  SETTINGS: `settings:${CACHE_VERSION}`,
  GST: `gst:${CACHE_VERSION}`,
  DELIVERY: `delivery:${CACHE_VERSION}`,
};

export const CACHE_TTL = {
  SHORT: 300, // 5 minutes
  MEDIUM: 3600, // 1 hour
  LONG: 86400, // 24 hours
  VERY_LONG: 604800, // 7 days
};
