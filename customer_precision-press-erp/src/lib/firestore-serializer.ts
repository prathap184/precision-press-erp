// @ts-nocheck
export function serializeFirestoreData(data: any): any {
  if (!data) return data;

  if (Array.isArray(data)) {
    return data.map(serializeFirestoreData);
  }

  if (typeof data === 'object') {
    if (typeof data.toDate === 'function') {
      return data.toDate().toISOString();
    }

    const serialized: any = {};

    for (const key in data) {
      serialized[key] = serializeFirestoreData(data[key]);
    }

    return serialized;
  }

  return data;
}
