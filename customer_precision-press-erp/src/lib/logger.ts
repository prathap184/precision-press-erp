// @ts-nocheck
import { adminDb } from './firebase-admin';
import * as admin from '@/lib/firebase-admin';

export async function logActivity({
  userId,
  role,
  action,
  meta = {},
}: {
  userId: string;
  role: string;
  action: string;
  meta?: any;
}) {
  try {
    // SECURITY: Use server-side admin SDK to write to a secure activity_logs collection.
    // This creates an immutable audit trail for the ERP system.
    await adminDb.collection('activity_logs').add({
      userId,
      userRole: role,
      action,
      meta,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      systemVersion: '0.1.0-zero-trust'
    });
  } catch (error) {
    // Fallback to console if DB write fails, to ensure we catch the error but don't break the main flow.
    console.error('CRITICAL: Audit logging failed:', error);
  }
}
