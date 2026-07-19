/**
 * shared/logging/audit.ts
 *
 * Audit event types and client-side audit logging utilities.
 * For server-side audit writes, each app implements its own audit writer
 * using the Supabase service role key (ERP only) or the anon key (customer portal).
 *
 * This file only defines the TYPES and a CLIENT-SIDE helper.
 * Actual DB writes happen in each app's API route handlers.
 */

export type AuditAction =
  // Auth
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  // Orders
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'ORDER_CANCELLED'
  | 'ORDER_PROXY_CREATED'
  // Payments
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  // Staff
  | 'STAFF_ROLE_CHANGED'
  | 'STAFF_BLOCKED'
  | 'STAFF_ACTIVATED'
  // Customer
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_PROFILE_UPDATED'
  // Workflow
  | 'WORKFLOW_STAGE_ADVANCED'
  | 'WORKFLOW_STAGE_REJECTED';

export interface AuditEvent {
  userId: string;
  userRole: string;
  action: AuditAction;
  entityId?: string;      // e.g., orderId, customerId
  entityType?: string;    // e.g., 'order', 'payment'
  meta?: Record<string, unknown>;
  app: 'ERP' | 'CUSTOMER_PORTAL';
  timestamp: string;
}

/** Build a typed audit event object. Actual write happens in the app's API layer. */
export function buildAuditEvent(
  partial: Omit<AuditEvent, 'timestamp' | 'app'>,
  app: 'ERP' | 'CUSTOMER_PORTAL'
): AuditEvent {
  return {
    ...partial,
    app,
    timestamp: new Date().toISOString(),
  };
}
