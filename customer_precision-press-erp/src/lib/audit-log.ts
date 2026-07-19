// @ts-nocheck
'use server';

/**
 * AUDIT LOG — SERVER ACTION
 * -------------------------
 * Writes structured audit entries to the `audit_logs` Firestore collection.
 * All fields are validated server-side. Admin identity is read from the
 * verified token cookie — never trusted from client input.
 *
 * Security: Uses firebase-admin SDK (server only). Never call from client.
 */

import { adminDb, adminAuth } from './firebase-admin';
import * as admin from '@/lib/firebase-admin';
import { cookies, headers } from 'next/headers';
import { UserRole } from '@/types/auth';

export interface AuditEntry {
  /** The customer/role being acted on behalf of */
  actedAs: string;
  actedAsType: 'CUSTOMER' | 'ROLE';
  /** Type of action being performed */
  actionType: string;
  /** The entity this action was performed on (orderId, paymentId, etc.) */
  entityType: 'ORDER' | 'ORDER_ITEM' | 'PAYMENT' | 'TRANSACTION' | 'WISHLIST' | 'PROFILE' | 'OTHER';
  entityId: string;
  /** Snapshot of state before action (optional but recommended) */
  beforeState?: Record<string, any>;
  /** Snapshot of state after action */
  afterState?: Record<string, any>;
  /** Any additional metadata */
  meta?: Record<string, any>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<{ success: boolean }> {
  try {
    // 1. Verify admin identity server-side — never trust client
    const cookieStore = cookies();
    const headerStore = headers();
    const token = cookieStore.get('customer_session')?.value;
    if (!token) throw new Error('Authentication required for audit log.');

    const ipAddress = headerStore.get('x-forwarded-for') || headerStore.get('x-real-ip') || '0.0.0.0';
    const userAgent = headerStore.get('user-agent') || 'Unknown';
    const sessionId = cookieStore.get('sessionId')?.value || null;
    const requestId = headerStore.get('x-request-id') || null;

    const decoded = await adminAuth.verifyIdToken(token);
    const adminId = decoded.uid;
    let adminRole = decoded.role as UserRole | undefined;
    const adminRolesFromToken = Array.isArray(decoded.roles) ? (decoded.roles as UserRole[]) : [];

    // Resolve allowed role from token claims if present
    if (!adminRole) {
      adminRole = adminRolesFromToken.find((role) => {
        return [
          'SUPER_ADMIN',
          'ADMIN',
          'MANAGER',
          'ACCOUNTANT',
          'DESIGNER',
          'PRINTER',
          'DISPATCH',
          'DELIVERY',
          'PASTING',
          'FIXING',
          'SUPPORT'
        ].includes(role);
      }) as UserRole | undefined;
    }

    // 2. Only authorized staff and admins can write audit logs
    const allowedStaffRoles: UserRole[] = [
      'SUPER_ADMIN',
      'ADMIN',
      'MANAGER',
      'ACCOUNTANT',
      'ACDEMA',
      'DESIGNER',
      'PRINTER',
      'DISPATCH',
      'DELIVERY',
      'SUPPORT'
    ];

    // FALLBACK: JWT custom claim may be stale (e.g. role was just assigned and
    // token hasn't been force-refreshed on the client yet). Read ground-truth
    // role from Firestore profiles before rejecting the request.
    if (!adminRole || !allowedStaffRoles.includes(adminRole)) {
      const profileSnap = await adminDb.collection('profiles').doc(adminId).get();
      if (profileSnap.exists) {
        const profileRole = profileSnap.data()?.role as UserRole | undefined;
        const profileRoles = Array.isArray(profileSnap.data()?.roles) ? (profileSnap.data()?.roles as UserRole[]) : [];
        if (profileRole && allowedStaffRoles.includes(profileRole)) {
          adminRole = profileRole;
        } else {
          const resolvedProfileRole = profileRoles.find((role) => allowedStaffRoles.includes(role));
          if (resolvedProfileRole) {
            adminRole = resolvedProfileRole;
          }
        }
      }
    }

    if (!adminRole || !allowedStaffRoles.includes(adminRole)) {
      throw new Error('Only admins and staff members can write audit logs.');
    }

    // 3. Write log and increment stats in a single transaction
    const logId = `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    await adminDb.runTransaction(async (transaction) => {
      const logRef = adminDb.collection('audit_logs').doc(logId);
      const statsRef = adminDb.collection('audit_stats').doc('global');

      transaction.set(logRef, {
        id: logId,
        adminId,           // real admin performing the action
        adminRole,
        actedAs: entry.actedAs,
        actedAsType: entry.actedAsType,
        actionType: entry.actionType,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeState: entry.beforeState ?? null,
        afterState: entry.afterState ?? null,
        previous_value: entry.beforeState ?? null,
        new_value: entry.afterState ?? null,
        ip_address: ipAddress,
        user_agent: userAgent,
        session_id: sessionId,
        request_id: requestId,
        actor_role: adminRole,
        meta: entry.meta ?? {},
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        systemVersion: '1.0.0-control-center',
      });

      // Increment stats
      transaction.set(statsRef, {
        actions: {
          total: admin.firestore.FieldValue.increment(1),
          byType: {
            [entry.actionType]: admin.firestore.FieldValue.increment(1)
          }
        },
        admins: {
          [adminId]: {
            actions: admin.firestore.FieldValue.increment(1)
          }
        }
      }, { merge: true });
    });

    return { success: true };
  } catch (error: any) {
    console.error('[AUDIT LOG CRITICAL FAILURE]', error);
    // Never throw from audit — don't block business flow
    return { success: false };
  }
}
