// @ts-nocheck
import { supabase } from './supabase';

// Compatibility facade for legacy imports.
// Firestore access is routed through the Supabase shim; auth now uses Supabase directly.
export const auth = {
  currentUser: null,
  async signOut() {
    return supabase.auth.signOut();
  },
} as any;

export const db = {} as Record<string, never>;
export const storage = {} as any;

export { supabase };
