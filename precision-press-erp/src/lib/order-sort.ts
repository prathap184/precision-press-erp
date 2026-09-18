/**
 * Centralized utility for sorting ERP orders newest first.
 * - Primary: createdAt timestamp descending
 * - Secondary: Base order ID descending (e.g. ORD-0011 > ORD-0010)
 * - Tertiary: Sub-item index ascending (e.g. ORD-0010-item1 before ORD-0010-item2)
 */

export function compareOrdersNewestFirst<T extends { id?: string; createdAt?: any }>(a: T, b: T): number {
  const timeA = a.createdAt
    ? (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : (a.createdAt as any).seconds ? (a.createdAt as any).seconds * 1000 : 0)
    : 0;
  const timeB = b.createdAt
    ? (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : (b.createdAt as any).seconds ? (b.createdAt as any).seconds * 1000 : 0)
    : 0;

  const idA = String(a.id || '');
  const idB = String(b.id || '');
  const [baseA, itemA] = idA.split('-item');
  const [baseB, itemB] = idB.split('-item');

  if (baseA !== baseB) {
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return baseB.localeCompare(baseA, undefined, { numeric: true });
  }

  const numA = itemA ? parseInt(itemA, 10) : 0;
  const numB = itemB ? parseInt(itemB, 10) : 0;
  return numA - numB;
}

export function sortOrdersNewestFirst<T extends { id?: string; createdAt?: any }>(orders: T[]): T[] {
  return [...orders].sort(compareOrdersNewestFirst);
}
