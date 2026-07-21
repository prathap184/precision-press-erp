import { supabaseServer } from './supabase-server';
import {
  createSupabaseFirestoreCompat,
  collection as coreCollection,
  doc as coreDoc,
  query as coreQuery,
  where as coreWhere,
  orderBy as coreOrderBy,
  limit as coreLimit,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  increment,
} from './supabase-firestore-core';

let __supabaseFirestoreCompatInitialized = false;

function ensureCompat() {
  if (!__supabaseFirestoreCompatInitialized) {
    createSupabaseFirestoreCompat(supabaseServer);
    __supabaseFirestoreCompatInitialized = true;
  }
}

async function getUserProfile(userId: string) {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[firebase-admin] profile lookup failed', error.message);
    return null;
  }

  return data;
}

export const adminAuth = {
  async verifyIdToken(token: string) {
    if (!token) {
      throw new Error('Missing authentication token');
    }

    const { data, error } = await supabaseServer.auth.getUser(token);
    if (error || !data.user) {
      console.error('[firebase-admin] verifyIdToken failed', error?.message || 'no user');
      
      // If token is expired, redirect to login page gracefully
      if (error?.message?.includes('expired') || error?.message?.includes('JWT')) {
        const { redirect } = await import('next/navigation');
        redirect('/staff-login?expired=true');
      }
      
      throw new Error('Unauthorized');
    }

    const profile = await getUserProfile(data.user.id);
    const metadata = (data.user.user_metadata as any) || {};
    const profileRoles = Array.isArray(profile?.roles) ? profile.roles : [];
    const metadataRoles = Array.isArray(metadata.roles) ? metadata.roles : [];
    const roles = profileRoles.length > 0 ? profileRoles : metadataRoles;
    const role =
      profile?.role ||
      (roles.length > 0 ? roles[0] : undefined) ||
      metadata.role ||
      'CUSTOMER';

    return {
      uid: data.user.id,
      email: data.user.email,
      name:
        metadata.name ||
        metadata.full_name ||
        data.user.email?.split('@')[0] ||
        'Unknown',
      role,
      roles,
      ...data.user,
      profile,
    };
  },

  async createUser(user: {
    email: string;
    password: string;
    displayName?: string;
    user_metadata?: Record<string, any>;
  }) {
    const { data, error } = await supabaseServer.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        full_name: user.displayName,
      },
    });

    if (error || !data.user) {
      console.error('[firebase-admin] createUser failed', error?.message || 'no user');
      throw error || new Error('Unable to create user');
    }

    return {
      ...data.user,
      uid: data.user.id,
    };
  },

  async updateUser(uid: string, updates: {
    email?: string;
    password?: string;
    displayName?: string;
    user_metadata?: Record<string, any>;
  }) {
    const { data, error } = await supabaseServer.auth.admin.updateUserById(uid, {
      email: updates.email,
      password: updates.password,
      email_confirm: true,
      user_metadata: {
        ...updates.user_metadata,
        full_name: updates.displayName,
      },
    });

    if (error || !data.user) {
      console.error('[firebase-admin] updateUser failed', error?.message || 'no user');
      throw error || new Error('Unable to update user');
    }

    return data.user;
  },

  async deleteUser(uid: string) {
    const { error } = await supabaseServer.auth.admin.deleteUser(uid);
    if (error) {
      console.error('[firebase-admin] deleteUser failed', error.message);
      throw error;
    }
    return { success: true };
  },

  async setCustomUserClaims(uid: string, claims: Record<string, any>) {
    if (!uid) {
      throw new Error('Missing UID for custom claims update');
    }

    const updates: Record<string, any> = {};
    if ('role' in claims) updates.role = claims.role;
    if ('roles' in claims) updates.roles = claims.roles;

    if (Object.keys(updates).length === 0) {
      return { success: true };
    }

    const { error } = await supabaseServer
      .from('profiles')
      .upsert({ id: uid, ...updates }, { onConflict: 'id' });

    if (error) {
      console.error('[firebase-admin] setCustomUserClaims failed', error.message);
      throw error;
    }

    return { success: true };
  },
};

export const firestore = {
  FieldValue: {
    serverTimestamp,
    increment,
    arrayUnion,
  },
  FieldPath: {
    documentId: () => 'id',
  },
  Timestamp: {
    now: () => new Date().toISOString(),
  },
};

export namespace firestore {
  export type Query = any;
  export type Transaction = {
    get(ref: any): Promise<any>;
    set(ref: any, data: any): any;
    update(ref: any, data: any): any;
    delete(ref: any): any;
  };
  export type DocumentReference = any;
  export type DocumentSnapshot<T = any> = {
    exists: boolean;
    id: string;
    data(): T;
  };
  export type QueryDocumentSnapshot<T = any> = DocumentSnapshot<T>;
  export type QuerySnapshot<T = any> = {
    docs: QueryDocumentSnapshot<T>[];
    forEach(callback: (doc: QueryDocumentSnapshot<T>) => void): void;
  };
  export type FieldValue = any;
}

function wrapSnapshot(snap: any) {
  if (!snap) return snap;
  if (typeof snap.exists === 'function') {
    const existsVal = snap.exists();
    Object.defineProperty(snap, 'exists', {
      get() {
        return existsVal;
      },
      configurable: true,
      enumerable: true,
    });
  }
  return snap;
}

function wrapQuerySnapshot(snap: any) {
  if (!snap) return snap;
  if (Array.isArray(snap.docs)) {
    snap.docs = snap.docs.map(wrapSnapshot);
  }
  if (typeof snap.exists === 'function') {
    wrapSnapshot(snap);
  }
  return snap;
}

function buildDocHandle(ref: ReturnType<typeof coreDoc>) {
  return {
    __ref: ref,
    async get() {
      return wrapSnapshot(await getDoc(ref));
    },
    async set(data: any) {
      return setDoc(ref, data);
    },
    async create(data: any) {
      const snap = await this.get();
      if (snap.exists) {
        const err = new Error('Document already exists');
        (err as any).code = 6;
        throw err;
      }
      return this.set(data);
    },
    async update(data: Record<string, any>) {
      return updateDoc(ref, data);
    },
    async delete() {
      return deleteDoc(ref);
    },
    collection(subcollectionName: string) {
      return buildCollectionHandle(coreCollection(supabaseServer, `${ref.path}/${subcollectionName}`));
    },
    id: ref.id,
    path: ref.path,
  };
}

function buildQueryHandle(ref: ReturnType<typeof coreCollection> | ReturnType<typeof coreQuery>) {
  const rawRef = (ref as any).__ref || ref;
  return {
    __ref: ref,
    async get() {
      return wrapQuerySnapshot(await getDocs(rawRef as any));
    },
    where(field: string, op: any, value: any) {
      return buildQueryHandle(coreQuery(rawRef as any, coreWhere(field, op, value)));
    },
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
      return buildQueryHandle(coreQuery(rawRef as any, coreOrderBy(field, direction)));
    },
    limit(count: number) {
      return buildQueryHandle(coreQuery(rawRef as any, coreLimit(count)));
    },
    doc(id: string) {
      return buildDocHandle(coreDoc(supabaseServer, `${ref.path}/${id}`));
    },
    collection(subcollectionName: string) {
      return buildCollectionHandle(coreCollection(supabaseServer, `${ref.path}/${subcollectionName}`));
    },
    path: ref.path,
  };
}

function buildCollectionHandle(ref: ReturnType<typeof coreCollection>) {
  return {
    __ref: ref,
    async get() {
      return wrapQuerySnapshot(await getDocs(ref));
    },
    async add(data: any) {
      return addDoc(ref, data);
    },
    doc(id?: string) {
      const generatedId = id || `generated_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      return buildDocHandle(coreDoc(supabaseServer, `${ref.path}/${generatedId}`));
    },
    where(field: string, op: any, value: any) {
      return buildQueryHandle(coreQuery(ref as any, coreWhere(field, op, value)));
    },
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
      return buildQueryHandle(coreQuery(ref as any, coreOrderBy(field, direction)));
    },
    limit(count: number) {
      return buildQueryHandle(coreQuery(ref as any, coreLimit(count)));
    },
    collection(subcollectionName: string) {
      return buildCollectionHandle(coreCollection(supabaseServer, `${ref.path}/${subcollectionName}`));
    },
    path: ref.path,
  };
}

function createTransactionHandle(promises: Promise<any>[]) {
  return {
    async get(ref: any) {
      return wrapSnapshot(await getDoc(ref.__ref || ref));
    },
    async getAll(...refs: any[]) {
      return Promise.all(refs.map(async ref => wrapSnapshot(await getDoc(ref.__ref || ref))));
    },
    set(ref: any, data: any) {
      const p = setDoc(ref.__ref || ref, data);
      promises.push(p);
      return p;
    },
    update(ref: any, data: any) {
      const p = updateDoc(ref.__ref || ref, data);
      promises.push(p);
      return p;
    },
    delete(ref: any) {
      const p = deleteDoc(ref.__ref || ref);
      promises.push(p);
      return p;
    },
  };
}

export const adminDb: any = {
  collection(name: string) {
    ensureCompat();
    return buildCollectionHandle(coreCollection(supabaseServer, name));
  },
  doc(...segments: string[]) {
    ensureCompat();
    return buildDocHandle(coreDoc(supabaseServer, segments.join('/')));
  },
  async runTransaction<T>(handler: (transaction: any) => Promise<T>) {
    ensureCompat();
    const promises: Promise<any>[] = [];
    const transaction = createTransactionHandle(promises);
    const result = await handler(transaction);
    await Promise.all(promises);
    return result;
  },
  batch() {
    ensureCompat();
    const operations: Array<() => Promise<void>> = [];
    return {
      set(ref: any, data: any) {
        operations.push(() => setDoc(ref.__ref || ref, data));
      },
      update(ref: any, data: any) {
        operations.push(() => updateDoc(ref.__ref || ref, data));
      },
      delete(ref: any) {
        operations.push(() => deleteDoc(ref.__ref || ref));
      },
      async commit() {
        for (const operation of operations) {
          await operation();
        }
      },
    };
  },
};
