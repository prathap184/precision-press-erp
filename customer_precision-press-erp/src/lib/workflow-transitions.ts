// @ts-nocheck
/**
 * workflow-transitions.ts
 * ────────────────────────
 * Client-safe MES transition functions.
 * These run in the browser — they use the anon/service-role Supabase client
 * and rely on RLS for security.
 *
 * Core model (append-only):
 *   enterDepartment  → INSERT a row with exited_at = NULL
 *   exitDepartment   → UPDATE exited_at, duration_minutes, sla_status on that row (once only)
 *   moveToDepartment → exitDepartment + enterDepartment (atomic-ish via sequential calls)
 */

import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface EnterDepartmentParams {
  departmentId: string;
  departmentName: string;
  parentOrderId: string;
  childOrderId?: string;
  priority?: WorkflowPriority;
  slaTargetMinutes?: number;
  operatorId?: string;
  operatorName?: string;
  remarks?: string;
  snapshot?: Record<string, any>;
  enteredBy?: string;
}

export interface ExitDepartmentParams {
  historyId: string;           // PK of the row to close
  exitedBy?: string;
  remarks?: string;
  isRework?: boolean;
  isRejected?: boolean;
}

export interface MoveOrderParams {
  /** Current open history row to close */
  currentHistoryId: string;
  /** Target department to move into */
  targetDepartmentId: string;
  targetDepartmentName: string;
  /** Inherited from the existing row */
  parentOrderId: string;
  childOrderId?: string;
  priority?: WorkflowPriority;
  slaTargetMinutes?: number;
  operatorId?: string;
  operatorName?: string;
  remarks?: string;
  exitRemarks?: string;
  snapshot?: Record<string, any>;
  movedBy?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeSlaStatus(enteredAt: string, slaTargetMinutes: number | null | undefined): 'MET' | 'BREACHED' | 'PENDING' {
  if (!slaTargetMinutes) return 'PENDING';
  const durationMin = Math.floor((Date.now() - new Date(enteredAt).getTime()) / 60000);
  return durationMin <= slaTargetMinutes ? 'MET' : 'BREACHED';
}

// ─── Enter Department ─────────────────────────────────────────────────────────
// Opens a new stage history row (exited_at stays NULL until explicitly closed)

export async function enterDepartment(params: EnterDepartmentParams) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('workflow_stage_history')
    .insert({
      department_id: params.departmentId,
      parent_order_id: params.parentOrderId,
      child_order_id: params.childOrderId || null,
      entered_at: now,
      exited_at: null,
      duration_minutes: null,
      sla_target_minutes: params.slaTargetMinutes || null,
      sla_status: 'PENDING',
      priority: params.priority || 'NORMAL',
      workflow_stage: 'IN_PROGRESS',
      workflow_status: 'OPEN',
      assigned_to: null,                // UUID — leave null unless operator UUID provided
      remarks: params.remarks || null,
      is_rework: false,
      is_rejected: false,
      queue_position: 0,
      // Store department_name + operator info in snapshot since no flat columns for them
      snapshot: {
        ...(params.snapshot || {}),
        departmentName: params.departmentName,
        operatorName: params.operatorName || null,
      },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to enter department: ${error.message}`);
  return data;
}

// ─── Exit Department ──────────────────────────────────────────────────────────
// Closes an open stage history row. Never called twice on the same row (append-only).

export async function exitDepartment(params: ExitDepartmentParams) {
  // First: read the row to get entered_at and sla_target_minutes
  const { data: existing, error: fetchErr } = await supabase
    .from('workflow_stage_history')
    .select('entered_at, sla_target_minutes, exited_at')
    .eq('id', params.historyId)
    .single();

  if (fetchErr || !existing) throw new Error('Workflow history row not found.');
  if (existing.exited_at) throw new Error('This stage has already been closed. Cannot modify history.');

  const now = new Date().toISOString();
  const durationMinutes = Math.floor((Date.now() - new Date(existing.entered_at).getTime()) / 60000);
  const slaStatus = computeSlaStatus(existing.entered_at, existing.sla_target_minutes);

  const { data, error } = await supabase
    .from('workflow_stage_history')
    .update({
      exited_at: now,
      duration_minutes: durationMinutes,
      sla_status: slaStatus,
      workflow_status: 'CLOSED',
      remarks: params.remarks || null,
      is_rework: params.isRework || false,
      is_rejected: params.isRejected || false,
      // exited_by stored in metadata (no flat column for it)
      metadata: {
        exited_by: params.exitedBy || null,
        closed_at: now,
      },
    })
    .eq('id', params.historyId)
    .is('exited_at', null)   // Safety: only update if still open
    .select()
    .single();

  if (error) throw new Error(`Failed to exit department: ${error.message}`);
  return data;
}

// ─── Move To Department ───────────────────────────────────────────────────────
// The core MES operation: close current stage → open next stage

export async function moveToDepartment(params: MoveOrderParams) {
  // Step 1: Close the current stage
  const closed = await exitDepartment({
    historyId: params.currentHistoryId,
    exitedBy: params.movedBy,
    remarks: params.exitRemarks || `Moved to ${params.targetDepartmentName}`,
  });

  // Step 2: Open the next stage
  const opened = await enterDepartment({
    departmentId: params.targetDepartmentId,
    departmentName: params.targetDepartmentName,
    parentOrderId: params.parentOrderId,
    childOrderId: params.childOrderId,
    priority: params.priority,
    slaTargetMinutes: params.slaTargetMinutes,
    operatorId: params.operatorId,
    operatorName: params.operatorName,
    remarks: params.remarks,
    snapshot: params.snapshot,
    enteredBy: params.movedBy,
  });

  return { closed, opened };
}

// ─── Complete & Exit (no next department) ────────────────────────────────────

export async function completeStage(params: ExitDepartmentParams) {
  return exitDepartment({ ...params });
}

// ─── Remove from Workflow ────────────────────────────────────────────────────

export async function removeFromWorkflow(historyId: string, removedBy?: string) {
  return exitDepartment({
    historyId,
    exitedBy: removedBy,
    remarks: 'Manually removed from workflow',
  });
}

// ─── Fetch orders eligible for admission ─────────────────────────────────────
// Returns orders that are NOT currently active in the given department

export async function fetchAdmissibleOrders(departmentId: string, limit = 50) {
  // Get order IDs already in this department's active queue
  const { data: activeRows } = await supabase
    .from('workflow_stage_history')
    .select('parent_order_id')
    .eq('department_id', departmentId)
    .is('exited_at', null);

  const activeOrderIds = (activeRows || []).map((r: any) => r.parent_order_id);

  // Fetch recent orders in production-eligible states
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .in('status', ['ASSIGNED', 'IN_PROGRESS', 'ACCOUNTANT_APPROVED', 'PAYMENT_VERIFIED', 'DESIGN_READY'])
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (error) throw error;

  // Normalize fields so the modal can display them uniformly
  const normalized = (orders || []).map((o: any) => ({
    ...o,
    // customer_snapshot is a JSONB column — map display fields
    customerName: o.customer_snapshot?.name || o.customerName || o.customer_snapshot?.displayName || '—',
    company: o.customer_snapshot?.company || o.customer_snapshot?.displayName || '',
    orderType: o.orderType || o.order_type || '—',
    quantity: o.items?.[0]?.quantity || null,
  }));

  // Exclude orders already in this department's queue
  return normalized.filter((o: any) => !activeOrderIds.includes(o.id));
}


// ─── Fetch departments list for the Move modal ───────────────────────────────

export async function fetchAllDepartments() {
  const { data, error } = await supabase
    .from('workflow_departments')
    .select('id, name, color, sla_minutes, display_order')
    .eq('active', true)
    .order('display_order');
  if (error) throw error;
  return data || [];
}

// ─── Get the open history row for an order in a specific dept ─────────────────

export async function getOpenHistoryRow(parentOrderId: string, departmentId: string) {
  const { data, error } = await supabase
    .from('workflow_stage_history')
    .select('*')
    .eq('parent_order_id', parentOrderId)
    .eq('department_id', departmentId)
    .is('exited_at', null)
    .order('entered_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data;
}
