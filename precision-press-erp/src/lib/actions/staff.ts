'use server';

import { randomUUID } from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';
import { adminDb } from '@/lib/firebase-admin';
import * as admin from '@/lib/firebase-admin';
import { StaffRole, StaffStatus, RoleHistoryEntry, StaffUser, ROLE_META } from '@/types/roles';
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
  printerCategory?: string | string[],
  printerSubCategory?: string | string[]
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
    if (finalRoles.includes('ACDEMA')) {
      if (!finalRoles.includes('ACCOUNTANT')) finalRoles.push('ACCOUNTANT');
      if (!finalRoles.includes('DESIGNER')) finalRoles.push('DESIGNER');
      if (!finalRoles.includes('MANAGER')) finalRoles.push('MANAGER');
    }
    // Determine primary role: keep currentProfile.role if it's still in newRoles, else use newRoles[0]
    const primaryRole = finalRoles.includes(currentProfile.role as StaffRole)
      ? (currentProfile.role as StaffRole)
      : finalRoles[0];

    // Get admin info
    const adminProfileSnap = await adminDb.collection('profiles').doc(claims.uid as string).get();
    const adminName = adminProfileSnap.exists ? adminProfileSnap.data()?.name : 'Admin';

    // Normalize printer categories & subcategories into arrays
    const nowIso = new Date().toISOString();
    const isPrinter = finalRoles.includes('PRINTER');

    const categoriesArray: string[] = Array.isArray(printerCategory)
      ? printerCategory.filter(Boolean)
      : (printerCategory ? printerCategory.split(',').map(s => s.trim()).filter(Boolean) : []);

    const subCategoriesArray: string[] = Array.isArray(printerSubCategory)
      ? printerSubCategory.filter(Boolean)
      : (printerSubCategory ? printerSubCategory.split(',').map(s => s.trim()).filter(Boolean) : []);

    const isMainPrinter = categoriesArray.includes('MAIN_PRINTER') || (!categoriesArray.length && printerCategory === 'MAIN_PRINTER');
    const pCat = isMainPrinter ? 'MAIN_PRINTER' : (categoriesArray.length > 0 ? categoriesArray.join(', ') : 'MAIN_PRINTER');
    const pSub = subCategoriesArray.length > 0 ? subCategoriesArray.join(', ') : null;

    let printingCategoryId: string | null = null;
    let printingSubcategoryId: string | null = null;

    if (isPrinter && !isMainPrinter && categoriesArray.length > 0) {
      // Find category ID for the primary selected category
      const firstCat = categoriesArray[0];
      const isCatUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firstCat);
      const catQuery = supabaseServer.from('printing_categories').select('id, name');
      const { data: catRecord } = isCatUuid
        ? await catQuery.eq('id', firstCat).maybeSingle()
        : await catQuery.ilike('name', firstCat).maybeSingle();

      if (catRecord) {
        printingCategoryId = catRecord.id;

        if (subCategoriesArray.length > 0) {
          const firstSub = subCategoriesArray[0];
          const isSubUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firstSub);
          const subQuery = supabaseServer
            .from('printing_subcategories')
            .select('id, name')
            .eq('category_id', catRecord.id);

          const { data: subRecord } = isSubUuid
            ? await subQuery.eq('id', firstSub).maybeSingle()
            : await subQuery.ilike('name', firstSub).maybeSingle();

          if (subRecord) {
            printingSubcategoryId = subRecord.id;
          }
        }
      }
    }

    // Update profiles collection (only use columns that actually exist on profiles)
    const profileUpdate: Record<string, any> = {
      role: primaryRole,
      roles: finalRoles,
      updatedAt: nowIso,
      printerCategory: isPrinter ? pCat : null,
      printing_category_name: isPrinter ? pCat : null,
      printing_category_id: isPrinter ? printingCategoryId : null,
      printing_subcategory_name: isPrinter ? pSub : null,
      printing_subcategory_id: isPrinter ? printingSubcategoryId : null,
    };
    
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
        updatedAt: nowIso,
        printerCategory: isPrinter ? pCat : null,
        printing_category_name: isPrinter ? pCat : null,
        printing_category_id: isPrinter ? printingCategoryId : null,
        printing_subcategory_name: isPrinter ? pSub : null,
        printing_subcategory_id: isPrinter ? printingSubcategoryId : null,
      };
      const { error: supaErr } = await supabaseServer
        .from('profiles')
        .update(supaProfileUpdate)
        .or(`id.eq.${targetUid},uid.eq.${targetUid}`);
      if (supaErr) {
        console.warn('[updateStaffRoles] supabaseServer profile update warning:', supaErr);
      }
    } catch (supaErr: any) {
      console.warn('[updateStaffRoles] supabaseServer profile update warning:', supaErr?.message);
    }

    // Update staff_users collection safely
    // Note: staff_users has metadata JSONB for arbitrary printer details
    try {
      const staffPayload: Record<string, any> = {
        uid: targetUid,
        roles: finalRoles,
        updated_at: nowIso,
        assigned_by: claims.uid,
        assigned_at: nowIso,
        metadata: isPrinter ? {
          printer_category: pCat,
          printer_categories: categoriesArray,
          printer_sub_category: pSub,
          printer_sub_categories: subCategoriesArray,
          printing_category_id: printingCategoryId,
          printing_subcategory_id: printingSubcategoryId,
        } : null,
      };

      const { data: existingStaff } = await supabaseServer
        .from('staff_users')
        .select('id, uid')
        .or(`id.eq.${targetUid},uid.eq.${targetUid}`)
        .maybeSingle();

      if (existingStaff) {
        await supabaseServer
          .from('staff_users')
          .update(staffPayload)
          .eq('id', existingStaff.id);
      } else {
        await supabaseServer
          .from('staff_users')
          .insert({
            id: targetUid,
            ...staffPayload,
          });
      }
    } catch (staffErr: any) {
      console.warn('[updateStaffRoles] staff_users sync warning (non-fatal):', staffErr?.message);
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
        const staffMeta = (staffRow.metadata && typeof staffRow.metadata === 'object') ? staffRow.metadata : {};
        const profileRoles = Array.isArray(staffRow.roles) && staffRow.roles.length > 0
          ? staffRow.roles
          : getEffectiveRoles(profile as UserProfile);

        return {
          uid: profileId,
          name: profile.name || profile.displayName || 'Unknown',
          email: profile.email || '',
          roles: profileRoles,
          status: (staffRow.status as StaffStatus) || (profile.status as StaffStatus) || 'ACTIVE',
          printerCategory: profile.printerCategory || profile.printing_category_name || staffMeta.printer_category || staffRow.printer_category || undefined,
          printerCategories: staffMeta.printer_categories || (profile.printing_category_name ? profile.printing_category_name.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
          printerSubCategory: profile.printing_subcategory_name || profile.printerSubCategory || staffMeta.printer_sub_category || staffRow.printer_sub_category || undefined,
          printerSubCategories: staffMeta.printer_sub_categories || (profile.printing_subcategory_name ? profile.printing_subcategory_name.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
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

// ─── Comprehensive Staff Activity ─────────────────────────────────────────────
export interface StaffActivityEvent {
  id: string;
  type: 'ROLE_CHANGE' | 'STATUS_CHANGE' | 'ORDER_PROCESSED' | 'ORDER_CREATED';
  title: string;
  description: string;
  actorId?: string;
  actorName?: string;
  timestamp: string;
  metadata?: Record<string, any>;
  badges?: Array<{ label: string; color?: string; bg?: string }>;
}

export async function getComprehensiveStaffActivity(userId: string): Promise<{
  staff: StaffUser | null;
  events: StaffActivityEvent[];
}> {
  try {
    const cleanUserId = decodeURIComponent(userId || '').trim();
    if (!cleanUserId) return { staff: null, events: [] };

    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    let claims: any = null;
    if (token) {
      try {
        claims = await verifyToken(token);
      } catch (err) {
        console.warn('[getComprehensiveStaffActivity] token warn:', err);
      }
    }

    const isAdmin = await isCallerAdmin(claims, cookieStore);
    const roleCookie = cookieStore.get('role')?.value?.toUpperCase();
    const isManager = (claims && ['MANAGER'].includes(String(claims.role || '').toUpperCase())) ||
      (claims && (claims.roles || []).some((r: string) => String(r).toUpperCase() === 'MANAGER')) ||
      roleCookie === 'MANAGER';

    if (!isAdmin && !isManager) {
      const directRole = String(claims?.role || '').toUpperCase();
      if (!['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(directRole)) {
        console.warn('[getComprehensiveStaffActivity] Forbidden access');
        return { staff: null, events: [] };
      }
    }

    // 1. Fetch user profile & staff metadata
    const { data: profileRow } = await supabaseServer
      .from('profiles')
      .select('*')
      .or(`id.eq.${cleanUserId},uid.eq.${cleanUserId}`)
      .maybeSingle();

    let profile = profileRow;
    if (!profile) {
      try {
        const fireSnap = await adminDb.collection('profiles').doc(cleanUserId).get();
        if (fireSnap.exists) {
          profile = { id: fireSnap.id, ...fireSnap.data() };
        }
      } catch {}
    }

    const { data: staffRow } = await supabaseServer
      .from('staff_users')
      .select('*')
      .or(`id.eq.${cleanUserId},uid.eq.${cleanUserId}`)
      .maybeSingle();

    const staffMeta = (staffRow?.metadata && typeof staffRow.metadata === 'object') ? staffRow.metadata : {};
    const staffData: StaffUser | null = profile ? {
      uid: profile.id || profile.uid || cleanUserId,
      name: profile.name || profile.displayName || 'Unknown',
      email: profile.email || '',
      roles: Array.isArray(staffRow?.roles) && staffRow.roles.length > 0 ? staffRow.roles : getEffectiveRoles(profile as UserProfile),
      status: (staffRow?.status as StaffStatus) || (profile.status as StaffStatus) || 'ACTIVE',
      printerCategory: profile.printerCategory || profile.printing_category_name || staffMeta.printer_category,
      printerCategories: staffMeta.printer_categories || (profile.printing_category_name ? profile.printing_category_name.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
      printerSubCategory: profile.printing_subcategory_name || profile.printerSubCategory || staffMeta.printer_sub_category,
      printerSubCategories: staffMeta.printer_sub_categories || (profile.printing_subcategory_name ? profile.printing_subcategory_name.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
      assignedBy: staffRow?.assigned_by,
      assignedAt: toPlain(staffRow?.assigned_at),
      updatedAt: toPlain(staffRow?.updated_at ?? profile.updatedAt),
      suspendedAt: toPlain(staffRow?.suspended_at),
      lastLoginAt: toPlain(staffRow?.last_login_at ?? profile.lastLogin),
    } : null;

    const events: StaffActivityEvent[] = [];

    // 2. Fetch role audit history from role_history table (Postgres column is userId)
    const { data: roleHistoryRows, error: rhErr } = await supabaseServer
      .from('role_history')
      .select('*')
      .eq('userId', cleanUserId)
      .order('changedAt', { ascending: false });

    if (rhErr) {
      console.warn('[getComprehensiveStaffActivity] role_history query note:', rhErr.message);
    }

    (roleHistoryRows || []).forEach((row: any) => {
      const action = String(row.action || 'UPDATE').toUpperCase();
      const isStatusChange = ['ACTIVATE', 'SUSPEND', 'DISABLE'].includes(action);
      events.push({
        id: row.id,
        type: isStatusChange ? 'STATUS_CHANGE' : 'ROLE_CHANGE',
        title: isStatusChange ? `Account ${action}D` : `Roles ${action}D`,
        description: row.reason ? `Reason: "${row.reason}"` : (action === 'UPDATE' ? 'Updated role permissions or production streams' : `Account was ${action.toLowerCase()}d`),
        actorId: row.changed_by || row.changedBy,
        actorName: row.changed_by_name || row.changedByName || 'Admin',
        timestamp: row.changed_at || row.changedAt,
        badges: (row.new_roles || row.newRoles || []).map((r: string) => ({
          label: r,
          color: ROLE_META[r as StaffRole]?.color || '#475569',
          bg: ROLE_META[r as StaffRole]?.bg || '#f1f5f9',
        })),
        metadata: {
          oldRoles: row.old_roles || row.oldRoles,
          newRoles: row.new_roles || row.newRoles,
        }
      });
    });

    // 3. Fetch orders created by this staff user (e.g. Proxy order creation)
    const { data: createdOrders } = await supabaseServer
      .from('orders')
      .select('id, customerName, amounts, createdAt, status, createdBy, proxyExecutor')
      .or(`createdBy.eq.${cleanUserId},proxyExecutor.ilike.%${cleanUserId}%`)
      .order('createdAt', { ascending: false })
      .limit(100);

    (createdOrders || []).forEach((o: any) => {
      const amt = o.amounts?.grandTotal ?? 0;
      events.push({
        id: `created_${o.id}`,
        type: 'ORDER_CREATED',
        title: `Placed Proxy Order #${o.id.replace('ORD-', '')}`,
        description: `Created order for ${o.customerName || 'Customer'} (Total: ₹${Number(amt).toLocaleString()}) - Status: ${o.status}`,
        actorId: cleanUserId,
        actorName: staffData?.name || 'Staff',
        timestamp: o.createdAt,
        metadata: { orderId: o.id, amount: amt },
        badges: [{ label: 'Proxy Order', color: '#0f766e', bg: '#ccfbf1' }]
      });
    });

    // 4. Fetch orders where this user executed/completed workflow steps
    const { data: recentOrders } = await supabaseServer
      .from('orders')
      .select('id, customerName, workflowSnapshot, updatedAt')
      .order('updatedAt', { ascending: false })
      .limit(200);

    const userName = staffData?.name;
    (recentOrders || []).forEach((ord: any) => {
      const steps = ord.workflowSnapshot?.steps || [];
      steps.forEach((step: any, stepIdx: number) => {
        const matchesUid = step.completedBy === cleanUserId;
        const matchesName = userName && step.completedBy && String(step.completedBy).toLowerCase() === userName.toLowerCase();
        if (matchesUid || matchesName) {
          events.push({
            id: `step_${ord.id}_${stepIdx}`,
            type: 'ORDER_PROCESSED',
            title: `Completed ${step.label || step.role} Stage`,
            description: `Finished stage for Order #${ord.id.replace('ORD-', '')} (${ord.customerName || 'Customer'})${step.notes ? ` - "${step.notes}"` : ''}`,
            actorId: cleanUserId,
            actorName: userName || 'Staff',
            timestamp: step.completedAt || ord.updatedAt,
            metadata: { orderId: ord.id, stepRole: step.role, stepLabel: step.label },
            badges: [{
              label: step.label || step.role,
              color: ROLE_META[step.role as StaffRole]?.color || '#2563eb',
              bg: ROLE_META[step.role as StaffRole]?.bg || '#dbeafe'
            }]
          });
        }
      });
    });

    // Sort all events newest first
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { staff: staffData, events };
  } catch (e: any) {
    console.error('[getComprehensiveStaffActivity] error:', e);
    return { staff: null, events: [] };
  }
}

