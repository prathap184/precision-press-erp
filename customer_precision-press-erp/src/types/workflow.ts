import { StaffRole } from './roles';

export type OrderStatus = 
  | 'PLACED' 
  | 'ACCOUNTANT_APPROVED'
  | 'ON_HOLD'
  | 'DESIGNING'
  | 'CUSTOMER_APPROVAL_PENDING'
  | 'DESIGN_READY'
  | 'PAYMENT_PENDING' 
  | 'PAYMENT_VERIFIED' 
  | 'ASSIGNED' 
  | 'IN_PROGRESS' 
  | 'PRODUCTION_PAUSED'
  | 'COMPLETED' 
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REJECTED';

export type RejectionReason = 
  | 'INVALID_ARTWORK'
  | 'PAYMENT_ISSUE'
  | 'SIZE_MISMATCH'
  | 'MISSING_DETAILS'
  | 'FRAUD_SUSPICION'
  | 'CUSTOMER_REJECTED_DESIGN'
  | 'OTHER';

export interface StatusHistoryEntry {
  from: OrderStatus;
  to: OrderStatus;
  by: string; // UID of user who made the change
  timestamp: any; // Firestore Timestamp
  notes?: string;
  reasonCode?: string;
}

export type PaymentMethod = 'CASH' | 'CREDIT' | 'ONLINE';

export interface DispatchMetadata {
  deliveryType: 'PICKUP' | 'COURIER' | 'TRANSPORT' | 'LOCAL_DELIVERY';
  transportName?: string;
  trackingNumber?: string;
  dispatchNote?: string;
  dispatchDate: any;
  handledBy: string; // UID
}

export const ORDER_STATUS_HIERARCHY: OrderStatus[] = [
  'PLACED',
  'ON_HOLD',
  'ACCOUNTANT_APPROVED',
  'DESIGNING',
  'CUSTOMER_APPROVAL_PENDING',
  'DESIGN_READY',
  'PAYMENT_PENDING',
  'PAYMENT_VERIFIED',
  'ASSIGNED',
  'IN_PROGRESS',
  'PRODUCTION_PAUSED',
  'COMPLETED',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED'
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'New Order',
  ACCOUNTANT_APPROVED: 'Accountant Approved',
  ON_HOLD: 'On Hold',
  DESIGNING: 'In Design Phase',
  CUSTOMER_APPROVAL_PENDING: 'Awaiting Customer Approval',
  DESIGN_READY: 'Design Finalized',
  PAYMENT_PENDING: 'Awaiting Payment',
  PAYMENT_VERIFIED: 'Payment Verified',
  ASSIGNED: 'Assigned to Production',
  IN_PROGRESS: 'In Production',
  PRODUCTION_PAUSED: 'Production Paused',
  COMPLETED: 'Ready for Dispatch',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected by Accountant'
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  PLACED: '#1e3a8a',
  ACCOUNTANT_APPROVED: '#059669',  // Emerald — approved/green signal
  ON_HOLD: '#f97316',              // Orange — paused/attention needed
  DESIGNING: '#8b5cf6',
  CUSTOMER_APPROVAL_PENDING: '#c026d3', // Fuchsia — user action needed
  DESIGN_READY: '#ec4899',
  PAYMENT_PENDING: '#f59e0b',
  PAYMENT_VERIFIED: '#10b981',
  ASSIGNED: '#6366f1',
  IN_PROGRESS: '#37007e',
  PRODUCTION_PAUSED: '#d97706',
  COMPLETED: '#006a61',
  DISPATCHED: '#4b5563',
  IN_TRANSIT: '#2563eb',
  DELIVERED: '#15803d',
  CANCELLED: '#ef4444',
  REJECTED: '#b91c1c'
};

/**
 * Validates if an order can transition from current to next status.
 * ENTERPRISE FLOW:
 *   PLACED → ACCOUNTANT_APPROVED → (DESIGNING? → CUSTOMER_APPROVAL_PENDING? → DESIGN_READY?) → PAYMENT_PENDING? → PAYMENT_VERIFIED? → ASSIGNED → IN_PROGRESS → COMPLETED → DISPATCHED
 */
export function canTransition(
  current: OrderStatus, 
  next: OrderStatus, 
  paymentMethod: PaymentMethod,
  creditInfo?: { balance: number; limit: number; amount: number }
): { allowed: boolean; reason?: string } {
  // Always allow cancellation (except after dispatch/completion)
  if (next === 'CANCELLED') return { allowed: current !== 'DISPATCHED' && current !== 'COMPLETED' };

  // Allow rejection only from PLACED (accountant rejects) 
  if (next === 'REJECTED') return { allowed: current === 'PLACED' };

  // Credit system enforcement
  if (paymentMethod === 'CREDIT' && creditInfo) {
    if (creditInfo.balance + creditInfo.amount > creditInfo.limit) {
      return { allowed: false, reason: 'Credit limit exceeded. Permission denied.' };
    }
  }

  // ── EXPLICIT TRANSITION RULES (deterministic, auditable) ──────────────────
  const ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
    'PLACED':               ['ACCOUNTANT_APPROVED', 'ON_HOLD', 'CANCELLED'],
    'ON_HOLD':              ['ACCOUNTANT_APPROVED', 'CANCELLED', 'REJECTED'],
    'ACCOUNTANT_APPROVED':  ['DESIGNING', 'PAYMENT_PENDING', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    'DESIGNING':            ['CUSTOMER_APPROVAL_PENDING', 'DESIGN_READY', 'ASSIGNED', 'IN_PROGRESS', 'CANCELLED', 'DESIGNING'],
    'CUSTOMER_APPROVAL_PENDING': ['DESIGN_READY', 'DESIGNING', 'CANCELLED'],
    'DESIGN_READY':         ['PAYMENT_PENDING', 'ASSIGNED', 'IN_PROGRESS', 'CANCELLED', 'CUSTOMER_APPROVAL_PENDING', 'DESIGNING', 'DESIGN_READY'],
    'PAYMENT_PENDING':      ['PAYMENT_VERIFIED', 'CANCELLED', 'CUSTOMER_APPROVAL_PENDING', 'DESIGNING'],
    'PAYMENT_VERIFIED':     ['ASSIGNED', 'CANCELLED', 'DESIGNING', 'DESIGN_READY', 'CUSTOMER_APPROVAL_PENDING'],
    'ASSIGNED':             ['IN_PROGRESS', 'CANCELLED', 'DESIGNING', 'DESIGN_READY', 'CUSTOMER_APPROVAL_PENDING'],
    'IN_PROGRESS':          ['PRODUCTION_PAUSED', 'COMPLETED', 'CANCELLED'],
    'PRODUCTION_PAUSED':    ['IN_PROGRESS', 'CANCELLED'],
    'COMPLETED':            ['DISPATCHED'],
    'DISPATCHED':           ['IN_TRANSIT', 'DELIVERED'],
    'IN_TRANSIT':           ['DELIVERED'],
    'DELIVERED':            [],   // terminal
    'CANCELLED':            [],   // terminal
    'REJECTED':             [],   // terminal
  };

  const allowed = ALLOWED_TRANSITIONS[current]?.includes(next) ?? false;
  if (!allowed) {
    return { allowed: false, reason: `Invalid transition: ${current} → ${next}` };
  }

  return { allowed: true };
}

// ─── DYNAMIC WORKFLOW ENGINE TYPES ──────────────────────────────────────────

/** 
 * Represents a single stage in the production pipeline.
 * Each stage is owned by a specific role.
 */
export interface WorkflowStep {
  id: string;
  label: string;
  role: StaffRole;
  description?: string;
  /** If true, this step must be completed before the next can start */
  blocking?: boolean;
}

/**
 * A reusable template for a product's production flow.
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  steps: WorkflowStep[];
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

/**
 * An immutable snapshot of a workflow at the time an order is placed.
 * Ensures that if the product workflow changes later, active orders are unaffected.
 */
export interface OrderWorkflowSnapshot {
  steps: OrderWorkflowStep[];
  currentStepIndex: number;
  templateId?: string;
  version: number;
  metadata?: any;
}

/**
 * An execution instance of a workflow step within an order.
 */
export interface OrderWorkflowStep extends WorkflowStep {
  status: 'LOCKED' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'REJECTED' | 'PAUSED';
  startedAt?: any;
  completedAt?: any;
  completedBy?: string; // UID of the staff member
  notes?: string;
  attachments?: string[]; // Array of attachment URLs

  // History of actions within this step
  history?: {
    status: string;
    timestamp: any;
    by: string;
    note?: string;
  }[];
}
