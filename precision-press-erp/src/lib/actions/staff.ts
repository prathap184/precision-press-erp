'use server';

import { randomUUID } from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';
import { adminDb } from '@/lib/firebase-admin';
import * as admin from '@/lib/firebase-admin';
import { StaffRole, StaffStatus, RoleHistoryEntry, StaffUser } from '@/types/roles';
import { getEffectiveRoles, UserProfile } from '@/types/auth';
import { verifyToken } from '@/lib/verifyToken';
import { cookies } from 'next/headers';

async function isCallerAdmin(claims: any, cookieStore?: any): Promise<boolean> {
  // 1. Direct claims check from verifyToken
  if (claims) {
    const role = String(claims.role || '').toUpperCase();
    const roles = (Array.isArray(claims.roles) ? claims.roles : []).map((r: any) => String(r).toUpperCase());
    if (['ADMIN', 'SUPER_ADMIN'].includes(role) || roles.includes('ADMIN') || roles.includes('SUPER_ADMIN')) {
      return true;
    }
  }

  // 2. Verified cookie session check
  if (cookieStore) {
    const roleCookie = cookieStore.get('role')?.value?.toUpperCase();
    if (roleCookie === 'ADMIN' || roleCookie === 'SUPER_ADMIN') return true;
    try {
      const rolesCookie = cookieStore.get('roles')?.value;
      if (rolesCookie) {
        const parsed = JSON.parse(decodeURIComponent(rolesCookie));
        if (Array.isArray(parsed)) {
          const upper = parsed.map((r: any) => String(r).toUpperCase());
          if (upper.includes('ADMIN') || upper.includes('SUPER_ADMIN')) return true;
        }
      }
    } catch {}
  }

  // 3. Firestore profiles check
  if (claims?.uid) {
    try {
      const snap = await adminDb.collection('profiles').doc(claims.uid).get();
      if (snap.exists) {
        const data = snap.data();
        const role = String(data?.role || '').toUpperCase();
        const roles = (Array.isArray(data?.roles) ? data.roles : []).map((r: any) => String(r).toUpperCase());
        if (['ADMIN', 'SUPER_ADMIN'].includes(role) || roles.includes('ADMIN') || roles.includes('SUPER_ADMIN')) {
          return true;
        }
      }
    } catch {}
  }

  // 4. Supabase profiles check
  if (claims?.email) {
    try {
      const { data: supaProfile } = await supabaseServer
        .from('profiles')
        .select('*')
        .eq('email', claims.email)
        .maybeSingle();
      if (supaProfile) {
        const role = String(supaProfile.role || '').toUpperCase();
        const roles = (Array.isArray(supaProfile.roles) ? supaProfile.roles : []).map((r: any) => String(r).toUpperCase());
        if (['ADMIN', 'SUPER_ADMIN'].includes(role) || roles.includes('ADMIN') || roles.includes('SUPER_ADMIN')) {
          return true;
        }
      }
    } catch {}
  }

  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toPlain(data: any): any {
  if (!data) return data;
  
  // Handle Firestore Timestamp
  if (data.toDate && typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(toPlain);
  }
  
  // Handle objects
  if (typeof data === 'object' && data !== null) {
    const plain: any = {};
    for (const key in data) {
      plain[key] = toPlain(data[key]);
    }
    return plain;
  }
  
  return data;
}

// ─── Log Role Change ──────────────────────────────────────────────────────────
async function insertRoleHistory(entry: Omit<RoleHistoryEntry, 'id' | 'changedAt'>): Promise<void> {
  const id = randomUUID();
  const nowIso = new Date().toISOString();
  const snakePayload = {
    id,
    user_id: entry.userId,
    user_name: entry.userName,
    old_roles: entry.oldRoles,
    new_roles: entry.newRoles,
    changed_by: entry.changedBy,
    changed_by_name: entry.changedByName,
    reason: entry.reason,
    action: entry.action,
    changed_at: nowIso,
  };

  const camelPayload = {
    id,
    userId: entry.userId,
    userName: entry.userName,
    oldRoles: entry.oldRoles,
    newRoles: entry.newRoles,
    changedBy: entry.changedBy,
    changedByName: entry.changedByName,
    reason: entry.reason,
    action: entry.action,
    changedAt: nowIso,
  };

  try {
    const { error } = await supabaseServer.from('role_history').insert(snakePayload);
    if (!error) return;

    if (error.code === 'PGRST204' || error.message?.includes("changed_at")) {
      const fallback = await supabaseServer.from('role_history').insert(camelPayload);
      if (fallback.error) console.error('[insertRoleHistory] fallback error:', fallback.error);
      return;
    }
    console.error('[insertRoleHistory] insert error:', error);
  } catch (err) {
    console.error('[insertRoleHistory] exception:', err);
  }
}

async function logRoleChange(entry: Omit<RoleHistoryEntry, 'id' | 'changedAt'>): Promise<void> {
  await insertRoleHistory(entry);
}

// ─── Update Staff Roles ───────────────────────────────────────────────────────
export async function updateStaffRoles(
  targetUid: string,
  newRoles: StaffRole[],
  reason?: string,
  printerCategory?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return { success: false, error: 'Not authenticated' };

    const claims = await verifyToken(token);
    const authorized = await isCallerAdmin(claims, cookieStore);
    if (!authorized) {
      return { success: false, error: 'Forbidden: Only admins can change roles' };
    }

    // Fetch current profile
    const profileRef = adminDb.collection('profiles').doc(targetUid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) return { success: false, error: 'User not found' };

    const currentProfile = profileSnap.data() as UserProfile;
    const oldRoles = getEffectiveRoles(currentProfile);

    // Exact roles requested by Admin
    const finalRoles = Array.from(new Set(newRoles));
    // Determine primary role: keep currentProfile.role if it's still in newRoles, else use newRoles[0]
    const primaryRole = finalRoles.includes(currentProfile.role as StaffRole)
      ? (currentProfile.role as StaffRole)
      : finalRoles[0];

    // Get admin info
    const adminProfileSnap = await adminDb.collection('profiles').doc(claims.uid as string).get();
    const adminName = adminProfileSnap.exists ? adminProfileSnap.data()?.name : 'Admin';

    // Update both collections atomically
    const now = admin.firestore.FieldValue.serverTimestamp();

    const pCat = printerCategory || 'MAIN_PRINTER';

    // Update profiles collection (primary, used by auth-context realtime listener)
    const profileUpdate: Record<string, any> = {
      role: primaryRole,
      roles: finalRoles,
    };
    // Save printerCategory only for PRINTER role; clear it for other roles
    if (newRoles.includes('PRINTER')) {
      profileUpdate.printerCategory = pCat;
    } else {
      profileUpdate.printerCategory = null;
    }
    
    try {
      await profileRef.update(profileUpdate);
    } catch (profErr: any) {
      console.warn('[updateStaffRoles] profileRef update warning:', profErr?.message);
    }

    // Also update Supabase profiles table directly
    try {
      const supaProfileUpdate: Record<string, any> = {
        role: primaryRole,
        roles: JSON.stringify(finalRoles),
        printerCategory: newRoles.includes('PRINTER') ? pCat : null,
      };
      const { error: supaErr } = await supabaseServer
        .from('profiles')
        .update(supaProfileUpdate)
        .or(`id.eq.${targetUid},uid.eq.${targetUid}`);
      if (supaErr) {
        console.error('[updateStaffRoles] supabaseServer profile update error:', supaErr);
      }
    } catch (supaErr: any) {
      console.warn('[updateStaffRoles] supabaseServer profile update warning:', supaErr?.message);
    }

    // Update staff_users collection (RBAC collection)
    const staffRef = adminDb.collection('staff_users').doc(targetUid);
    const staffPayload: Record<string, any> = {
      uid: targetUid,
      roles: finalRoles,
      updated_at: now,
      assigned_by: claims.uid,
      assigned_at: now,
    };
    if (newRoles.includes('PRINTER')) {
      staffPayload.printer_category = pCat;
    }

    try {
      await staffRef.set(staffPayload, { merge: true });
    } catch (staffErr: any) {
      console.warn('[updateStaffRoles] staffRef set error, attempting fallback without printer_category:', staffErr?.message);
      delete staffPayload.printer_category;
      delete staffPayload.printerCategory;
      await staffRef.set(staffPayload, { merge: true });
    }

    // Audit log
    await logRoleChange({
      userId: targetUid,
      userName: currentProfile.name,
      oldRoles,
      newRoles,
      changedBy: claims.uid as string,
      changedByName: adminName,
      reason,
      action: 'UPDATE',
    });

    return { success: true };
  } catch (e: any) {
    console.error('[updateStaffRoles] Critical failure:', e);
    return { success: false, error: e.message || 'Internal server error' };
  }
}

// ─── Update Staff Status ──────────────────────────────────────────────────────
export async function updateStaffStatus(
  targetUid: string,
  newStatus: StaffStatus,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return { success: false, error: 'Not authenticated' };

    const claims = await verifyToken(token);
    const authorized = await isCallerAdmin(claims, cookieStore);
    if (!authorized) {
      return { success: false, error: 'Forbidden' };
    }

    const profileRef = adminDb.collection('profiles').doc(targetUid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) return { success: false, error: 'User not found' };

    const currentProfile = profileSnap.data() as UserProfile;

    const adminProfileSnap = await adminDb.collection('profiles').doc(claims.uid as string).get();
    const adminName = adminProfileSnap.exists ? adminProfileSnap.data()?.name : 'Admin';

    const now = admin.firestore.FieldValue.serverTimestamp();
    const updateData: Record<string, any> = { status: newStatus };

    await profileRef.update(updateData);

    const staffRef = adminDb.collection('staff_users').doc(targetUid);
    await staffRef.set({
      uid: targetUid,
      status: newStatus,
      updated_at: now,
      ...(newStatus === 'SUSPENDED' ? { suspended_at: now } : {}),
    }, { merge: true });

    const actionMap: Record<StaffStatus, RoleHistoryEntry['action']> = {
      ACTIVE: 'ACTIVATE',
      SUSPENDED: 'SUSPEND',
      DISABLED: 'DISABLE',
    };

    await logRoleChange({
      userId: targetUid,
      userName: currentProfile.name,
      oldRoles: getEffectiveRoles(currentProfile),
      newRoles: getEffectiveRoles(currentProfile),
      changedBy: claims.uid as string,
      changedByName: adminName,
      reason,
      action: actionMap[newStatus],
    });

    return { success: true };
  } catch (e: any) {
    console.error('[updateStaffStatus] Critical failure:', e);
    return { success: false, error: e.message || 'Internal server error' };
  }
}

// ─── Get Staff List ───────────────────────────────────────────────────────────
export async function getStaffList(): Promise<StaffUser[]> {
  try {
    const [profilesResult, staffRowsResult] = await Promise.all([
      supabaseServer
        .from('profiles')
        .select('*')
        .in('role', ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACDEMA', 'ACCOUNTANT', 'DESIGNER', 'PRINTER', 'DISPATCH', 'DELIVERY', 'PASTING', 'FINISHING', 'FIXING', 'SUPPORT']),
      supabaseServer.from('staff_users').select('*'),
    ]);

    if (profilesResult.error) throw profilesResult.error;
    if (staffRowsResult.error) throw staffRowsResult.error;

    const staffRowsById = new Map<string, any>();
    (staffRowsResult.data ?? []).forEach((row: any) => {
      const key = row.uid || row.id;
      if (key) staffRowsById.set(key, row);
    });

    const users = (profilesResult.data ?? [])
      .map((row: any) => {
        const profile = row as Record<string, any>;
        const profileId = profile.uid || profile.id;
        const staffRow = staffRowsById.get(profileId) || {};
        const profileRoles = Array.isArray(staffRow.roles) && staffRow.roles.length > 0
          ? staffRow.roles
          : getEffectiveRoles(profile as UserProfile);

        return {
          uid: profileId,
          name: profile.name || profile.displayName || 'Unknown',
          email: profile.email || '',
          roles: profileRoles,
          status: (staffRow.status as StaffStatus) || (profile.status as StaffStatus) || 'ACTIVE',
          printerCategory: staffRow.printerCategory || profile.printerCategory || undefined,
          assignedBy: staffRow.assigned_by,
          assignedAt: toPlain(staffRow.assigned_at),
          updatedAt: toPlain(staffRow.updated_at ?? profile.updatedAt),
          suspendedAt: toPlain(staffRow.suspended_at),
          lastLoginAt: toPlain(staffRow.last_login_at ?? profile.lastLogin),
        } satisfies StaffUser;
      })
      .filter(u => u.roles.length > 0);

    return users;
  } catch (e: any) {
    console.error('[getStaffList] Detailed Error:', e);
    // Return empty array to prevent client-side crashes, but log the error
    return [];
  }
}

// ─── Get Role History ─────────────────────────────────────────────────────────
export async function getRoleHistory(userId?: string): Promise<RoleHistoryEntry[]> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return [];

    const claims = await verifyToken(token);
    if (!['ADMIN', 'SUPER_ADMIN'].includes(claims?.role as string)) {
      return [];
    }

    const normalizeRow = (data: any, id: string): RoleHistoryEntry => {
      return toPlain({
        id,
        userId: data.user_id ?? data.userId,
        userName: data.user_name ?? data.userName,
        oldRoles: data.old_roles ?? data.oldRoles,
        newRoles: data.new_roles ?? data.newRoles,
        changedBy: data.changed_by ?? data.changedBy,
        changedByName: data.changed_by_name ?? data.changedByName,
        reason: data.reason,
        action: data.action,
        metadata: data.metadata ?? {},
        changedAt: data.changed_at ?? data.changedAt,
      }) as RoleHistoryEntry;
    };

    const queryHistory = async (fieldName: string) => {
      let q: admin.firestore.Query = adminDb.collection('role_history');
      if (userId) {
        q = q.where('userId', '==', userId);
      }
      q = q.orderBy(fieldName, 'desc');
      const snap = await q.get();
      return snap.docs.map(d => normalizeRow(d.data(), d.id));
    };

    try {
      return await queryHistory('changed_at');
    } catch (e: any) {
      if (e?.code === 'PGRST204' && e.message?.includes('changed_at')) {
        return await queryHistory('changedAt');
      }
      throw e;
    }
  } catch (e: any) {
    console.error('[getRoleHistory] Detailed Error:', e);
    return [];
  }
}

