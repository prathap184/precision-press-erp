// @ts-nocheck
import { supabase } from './supabase';
import { createSupabaseFirestoreCompat } from './supabase-firestore-core';

const compat = createSupabaseFirestoreCompat(supabase);

export const collection = compat.collection;
export const doc = compat.doc;
export const query = compat.query;
export const where = compat.where;
export const orderBy = compat.orderBy;
export const limit = compat.limit;
export const getDocs = compat.getDocs;
export const getDoc = compat.getDoc;
export const addDoc = compat.addDoc;
export const setDoc = compat.setDoc;
export const updateDoc = compat.updateDoc;
export const deleteDoc = compat.deleteDoc;
export const getCountFromServer = compat.getCountFromServer;
export const onSnapshot = compat.onSnapshot;
export const serverTimestamp = compat.serverTimestamp;
export const arrayUnion = compat.arrayUnion;
export const increment = compat.increment;
export type { Unsubscribe } from './supabase-firestore-core';
