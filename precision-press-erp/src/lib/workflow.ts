'use server';

// NOTE: Import workflow types/constants directly from '@/types/workflow', NOT from here.
// 'use server' files may ONLY export async functions.
/**
 * STAFF ROLES: SUPER_ADMIN, ADMIN, MANAGER, ACDEMA, SUPPORT, DESIGNER
 * Any of these roles can execute proxy actions (createOrder, updateStatus) for customers.
 */
// Invoice generation is now manual — no imports from documents.ts needed here.

import { 
  OrderStatus, 
  PaymentMethod, 
  DispatchMetadata, 
  canTransition,
  ORDER_STATUS_HIERARCHY,
  RejectionReason,
  StatusHistoryEntry,
  OrderWorkflowSnapshot,
  OrderWorkflowStep
} from '@/types/workflow';

import { adminDb, adminAuth } from './firebase-admin';
import * as admin from '@/lib/firebase-admin';
import { logActivity } from './logger';
import { writeAuditLog } from './audit-log';
import { updateStatsIncrementally, detectAnomalies } from './stats';
import { UserProfile, UserRole, getEffectiveRoles } from '@/types/auth';
import { cookies } from 'next/headers';
import { enqueueTallySync, buildSalesInvoicePayload } from '@/lib/actions/tally-sync';
import { getFileNameFromPath, inspectTiffPath, isValidTiffPath, resolvePrintWorkflow } from './tiff-utils';
import { sendNotification } from './notifications';
import { supabaseServer } from './supabase-server';
import { getCachedProduct, getCachedWorkflow } from '@/lib/cache/products';
import { calculateOrderTotals } from './pricing';
import { generateOrderId, generateChildOrderId, generateJobId } from './order-ids';


import { getWorkspaceMode } from './workspaceAccess';
import { StaffRole } from '@/types/roles';

function checkStageNotCompleted(stageRole: StaffRole, workflowSnapshot?: OrderWorkflowSnapshot | null) {
  if (!workflowSnapshot) return;
  const mode = getWorkspaceMode(stageRole, workflowSnapshot);
  if (mode === 'READ_ONLY') {
    throw new Error(`Stage ${stageRole} has already been completed and cannot be modified.`);
  }
}

const STATUS_STATS_MAPPING: Record<string, string[]> = {
  'PLACED': ['orders.placed'],
  'ON_HOLD': ['orders.onHold'],
  'ACCOUNTANT_APPROVED': ['orders.accountantApproved'],
  'PAYMENT_PENDING': ['orders.paymentPending'],
  'PAYMENT_VERIFIED': ['orders.verified'],
  'ASSIGNED': ['orders.assigned'],
  'IN_PROGRESS': ['orders.inProgress'],
  'COMPLETED': ['orders.completed'],
  'DISPATCHED': ['orders.dispatched', 'dispatch.completed'],
  'REJECTED': ['orders.rejected'],
  'CANCELLED': ['orders.cancelled']
};

/**
 * SECURITY: The only way to get a user on the server.
 * Verifies the ID token from cookies and checks roles.
 */
export async function getAuthorizedUser(allowedRoles?: UserRole[]) {
  if (typeof global !== 'undefined' && (global as any).__mockUser) {
    return (global as any).__mockUser;
  }
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) throw new Error('Authentication required.');

  try {
    const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
    if (authError || !user) throw new Error(`Unauthorized: ${authError?.message || 'No user found for token'}`);

    const { data: profile, error: profileErr } = await supabaseServer
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) throw new Error('Profile not found');
    
    // Normalize role string to uppercase
    const rawRole = profile?.role ?? 'CUSTOMER';
    const role = String(rawRole).toUpperCase() as UserRole;
    
    // Get effective roles and normalize them all to uppercase
    const effectiveRoles = getEffectiveRoles(profile as any, role).map(r => String(r).toUpperCase());

    if (allowedRoles && !allowedRoles.some(required => effectiveRoles.includes(required as any) || role === required)) {
      console.error('DEBUG AUTH FAILED:', {
        uid: user.id,
        profileRole: profile?.role,
        profileRoles: (profile as any)?.roles,
        computedRole: role,
        computedEffective: effectiveRoles,
        allowedRoles
      });
      throw new Error(`Permission denied. Required: ${allowedRoles.join(', ')}`);
    }

    return { 
      id: user.id, 
      name: profile.name || (user.email?.split('@')[0] || 'Unknown'), 
      role,
      roles: effectiveRoles,
      profile // Reuse this to prevent duplicate fetches
    };
  } catch (error) {
    console.error('Auth Verification Error:', error);
    throw new Error('Invalid or expired session.');
  }
}

function extractFileNameFromUrl(url: string) {
  if (!url) return 'design-file';
  try {
    const path = new URL(url).pathname;
    const last = path.split('/').filter(Boolean).pop();
    return last || 'design-file';
  } catch {
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'design-file';
  }
}

function ensureDesignerOrderAccess(orderData: any, user: { id: string; role: UserRole }) {
  if (user.role === 'ADMIN' || user.role === 'MANAGER' || user.role === 'SUPER_ADMIN') return;
  const assignedDesigner = orderData?.workflow?.designedBy || orderData?.workflow?.assignedTo || null;
  if (assignedDesigner && assignedDesigner !== user.id) {
    throw new Error('You are not assigned to this design stage.');
  }
}

/**
 * ACTION: Designer workflow entry
 */
export async function startDesigning(orderId: string) {
  const user = await getAuthorizedUser(['DESIGNER', 'ADMIN', 'MANAGER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('DESIGNER', orderSnap.data()?.workflowSnapshot);
  }
  return await transitionOrder(orderId, 'DESIGNING', 'Started Pre-Press Design', user);
}

/**
 * ACTION: Designer sends design to customer for verification
 */
export async function sendForCustomerApproval(orderId: string, designUrl?: string, notes?: string) {
  const user = await getAuthorizedUser(['DESIGNER', 'ADMIN', 'MANAGER']);
  
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) {
    throw new Error(`Order ${orderId} not found.`);
  }
  const orderData = orderSnap.data() as any;
  checkStageNotCompleted('DESIGNER', orderData.workflowSnapshot);
  ensureDesignerOrderAccess(orderData, user);

  const itemsSnap = await adminDb.collection('orders').doc(orderId).collection('items').get();
  const orderItems = itemsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
  const itemDesignFiles = orderItems
    .map((item: any) => {
      const itemDesignUrl = (item?.designUrl || item?.fileUrl || '').trim();
      if (!itemDesignUrl) return null;
      return {
        itemId: item.id,
        productId: item.productId || '',
        productName: item.productName || '',
        url: itemDesignUrl,
        fileName: extractFileNameFromUrl(itemDesignUrl),
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id,
      };
    })
    .filter(Boolean);

  const existingProofs = Array.isArray(orderData.workflow?.designerProofs) ? orderData.workflow.designerProofs : [];
  const nextVersion = existingProofs.length + 1;
  const proofUrl = (designUrl || orderData.workflow?.designUrl || itemDesignFiles[0]?.url || '').trim();
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (!proofUrl && itemDesignFiles.length === 0 && orderData.workflow?.customerDesignProvided !== true) {
    throw new Error('Proof URL is required before sending for customer approval.');
  }

  const customerDesignProvided = itemDesignFiles.length > 0 || orderData.workflow?.customerDesignProvided === true || !!proofUrl;

  const proofEntry = {
    version: nextVersion,
    url: proofUrl,
    notes: notes || '',
    uploadedBy: user.id,
    uploadedAt: new Date().toISOString(),
    customerResponse: 'PENDING',
    items: itemDesignFiles
  };

  const meta: any = { 
    'workflow.designUrl': proofUrl,
    'workflow.designNotes': notes || '',
    'workflow.sentForApprovalAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.designedBy': user.id,
    'workflow.designerProofs': admin.firestore.FieldValue.arrayUnion(proofEntry),
    'workflow.customerDesignFiles': itemDesignFiles,
    'workflow.customerDesignProvided': customerDesignProvided,
    'workflow.customerApproval.status': 'PENDING',
    'workflow.customerApproval.currentProofVersion': nextVersion,
    'workflow.customerApproval.approvedAt': null,
    'workflow.customerApproval.approvedBy': null,
    'workflow.customerApproval.rejectedAt': null,
    'workflow.customerApproval.rejectionReason': '',
    'workflow.customerRevisionRequired': false,
    notes // keep this for the audit log meta 
  };

  // If this order uses a dynamic workflow snapshot, update the active step status to ON_HOLD
  if (orderData.workflowSnapshot) {
    const snapshot = orderData.workflowSnapshot as OrderWorkflowSnapshot;
    const currentIdx = snapshot.currentStepIndex;
    if (snapshot.steps && currentIdx < snapshot.steps.length) {
      snapshot.steps[currentIdx].status = 'ON_HOLD';
      snapshot.steps[currentIdx].notes = notes || 'Sent design for customer approval';
      
      // Update dynamic workflow metadata with the designUrl
      if (!snapshot.metadata) {
        snapshot.metadata = {};
      }
      snapshot.metadata.designUrl = proofUrl;
      snapshot.metadata.notes = notes || '';
      snapshot.metadata.currentProofVersion = nextVersion;
      
      meta.workflowSnapshot = snapshot;
    }
  }
  
  const result = await transitionOrder(orderId, 'CUSTOMER_APPROVAL_PENDING', 'Sent Design for Customer Approval', user, meta);
  
  // Notify customer
  const customerId = orderData.customerId;
  if (customerId) {
    await sendNotification(customerId, 'DESIGN_APPROVAL_NEEDED', `Design proof v${nextVersion} for Order ${orderId} is ready for your review.`, { orderId, designUrl: proofUrl, version: nextVersion });
  }

  await writeAuditLog({
    actedAs: user.id,
    actedAsType: 'ROLE',
    actionType: 'DESIGN_PROOF_UPLOADED',
    entityType: 'ORDER',
    entityId: orderId,
    meta: { version: nextVersion, designUrl: proofUrl, notes: notes || '' }
  });

  return result;
}


/**
 * ACTION: Customer approves the design
 */
export async function customerApproveDesign(orderId: string) {
  const user = await getAuthorizedUser(['CUSTOMER', 'ADMIN', 'MANAGER']);
  
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) throw new Error('Order not found.');
  const orderData = orderSnap.data() as any;
  
  if (user.role === 'CUSTOMER' && orderData.customerId !== user.id) {
    throw new Error('You are not authorized to approve this design.');
  }

  // Mark the design as customer-approved, but keep it under the designer until they explicitly hand it off.
  const result = await transitionOrder(orderId, 'DESIGN_READY', 'Customer Approved Design', user, {
    'workflow.designApprovedAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.designApprovedByCustomer': true,
    'workflow.customerApproval.status': 'APPROVED',
    'workflow.customerApproval.approvedAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.customerApproval.approvedBy': user.id,
    'workflow.customerApproval.rejectionReason': '',
    'workflow.customerRevisionRequired': false,
    'currentWorkflowRole': 'DESIGNER',
    'currentWorkflowLabel': 'Design Approved',
  });

  // If this order uses dynamic workflow, also complete the DESIGNER step and unlock the next dynamic workflow step
  try {
    await adminDb.runTransaction(async (transaction) => {
      const orderRef = adminDb.collection('orders').doc(orderId);
      const freshSnap = await transaction.get(orderRef);
      const freshData = freshSnap.data() as any;
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const approvalVersion = freshData?.workflow?.customerApproval?.currentProofVersion;
      const proofs = Array.isArray(freshData?.workflow?.designerProofs) ? [...freshData.workflow.designerProofs] : [];
      if (approvalVersion && proofs.length > 0) {
        const idx = proofs.findIndex((p: any) => p?.version === approvalVersion);
        if (idx !== -1) {
          proofs[idx] = {
            ...proofs[idx],
            customerResponse: 'APPROVED'
          };
          updateData['workflow.designerProofs'] = proofs;
        }
      }

      if (freshData?.workflowSnapshot?.steps) {
        const snapshot = freshData.workflowSnapshot as OrderWorkflowSnapshot;
        const currentIdx = snapshot.currentStepIndex;
        if (currentIdx < snapshot.steps.length) {
          const currentStep = snapshot.steps[currentIdx];
          
          if (currentStep.role === 'DESIGNER') {
            snapshot.steps[currentIdx] = {
              ...currentStep,
              status: 'COMPLETED',
              completedAt: new Date(),
              completedBy: user.id,
              notes: 'Customer approved design'
            };
            updateData.workflowSnapshot = snapshot;
            updateData.currentWorkflowRole = 'DESIGNER';
            updateData.currentWorkflowLabel = 'Design Approved';
            
            transaction.update(orderRef, updateData);
          }
        }
      } else {
        transaction.update(orderRef, updateData);
      }
    });
  } catch (snapErr) {
    console.warn('[customerApproveDesign] Could not advance workflow snapshot:', snapErr);
  }

  // Update subcollection items designStatus to APPROVED
  try {
    const itemsSnap = await adminDb.collection('orders').doc(orderId).collection('items').get();
    if (itemsSnap && itemsSnap.docs) {
      for (const itemDoc of itemsSnap.docs) {
        const itemData = itemDoc.data();
        if (itemData.designStatus === 'CUSTOMER_REVIEW') {
          await adminDb.collection('orders').doc(orderId).collection('items').doc(itemDoc.id).update({
            designStatus: 'APPROVED'
          });
        }
      }
    }
  } catch (err) {
    console.error('[customerApproveDesign] failed to update subcollection items:', err);
  }

  // Notify the designer (if known) that approval was granted
  const designerUid = orderData.workflow?.designedBy || orderData.workflow?.assignedTo;
  if (designerUid) {
    await sendNotification(
      designerUid,
      'DESIGN_APPROVED_BY_CUSTOMER',
      `Great news! Customer approved your design for Order #${orderId.slice(-6).toUpperCase()}. The order is now moving to production.`,
      { orderId }
    );
  }

  await writeAuditLog({
    actedAs: user.id,
    actedAsType: 'CUSTOMER',
    actionType: 'DESIGN_PROOF_APPROVED',
    entityType: 'ORDER',
    entityId: orderId,
    meta: { version: orderData?.workflow?.customerApproval?.currentProofVersion || 0 }
  });

  return result;
}

/**
 * ACTION: Customer rejects the design
 */
export async function customerRejectDesign(orderId: string, notes: string) {
  const user = await getAuthorizedUser(['CUSTOMER', 'ADMIN', 'MANAGER']);
  if (!notes) throw new Error('Reason for rejection is required.');

  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) throw new Error('Order not found.');
  const orderData = orderSnap.data() as any;
  
  if (user.role === 'CUSTOMER' && orderData.customerId !== user.id) {
    throw new Error('You are not authorized to reject this design.');
  }

  // Revert to DESIGNING so the designer can revise
  const result = await transitionOrder(orderId, 'DESIGNING', 'Customer Rejected Design — Revision Required', user, {
    'workflow.designRejectedAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.latestRejectionNotes': notes,
    'workflow.customerApproval.status': 'REJECTED',
    'workflow.customerApproval.rejectedAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.customerApproval.rejectionReason': notes,
    'workflow.customerRevisionRequired': false,
    notes
  });

  // If this order uses dynamic workflow, also reset the designer's step to IN_PROGRESS
  // so they can see it back in their queue
  try {
    await adminDb.runTransaction(async (transaction) => {
      const orderRef = adminDb.collection('orders').doc(orderId);
      const freshSnap = await transaction.get(orderRef);
      const freshData = freshSnap.data() as any;
      if (freshData?.workflowSnapshot?.steps) {
        const snapshot = freshData.workflowSnapshot;
        const updateData: any = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const rejectVersion = freshData?.workflow?.customerApproval?.currentProofVersion;
        const proofs = Array.isArray(freshData?.workflow?.designerProofs) ? [...freshData.workflow.designerProofs] : [];
        if (rejectVersion && proofs.length > 0) {
          const pIdx = proofs.findIndex((p: any) => p?.version === rejectVersion);
          if (pIdx !== -1) {
            proofs[pIdx] = {
              ...proofs[pIdx],
              customerResponse: 'REJECTED',
              rejectionReason: notes
            };
            updateData['workflow.designerProofs'] = proofs;
          }
        }

        const designerStepIdx = snapshot.steps.findIndex((s: any) => s.role === 'DESIGNER');
        if (designerStepIdx !== -1) {
          snapshot.currentStepIndex = designerStepIdx;
          snapshot.steps[designerStepIdx].status = 'IN_PROGRESS';
          snapshot.steps[designerStepIdx].notes = `Customer rejected. Reason: ${notes}`;
          // Reset downstream steps
          for (let i = designerStepIdx + 1; i < snapshot.steps.length; i++) {
            snapshot.steps[i].status = 'LOCKED';
          }
          updateData.workflowSnapshot = snapshot;
          updateData.currentWorkflowRole = snapshot.steps[designerStepIdx].role;
          updateData.currentWorkflowLabel = snapshot.steps[designerStepIdx].label;
          transaction.update(orderRef, updateData);
        }
      }
    });
  } catch (snapErr) {
    // Non-blocking — legacy orders without snapshots just use status
    console.warn('[customerRejectDesign] Could not reset workflow snapshot:', snapErr);
  }

  // Update subcollection items designStatus to DESIGN_IN_PROGRESS
  try {
    const itemsSnap = await adminDb.collection('orders').doc(orderId).collection('items').get();
    if (itemsSnap && itemsSnap.docs) {
      for (const itemDoc of itemsSnap.docs) {
        const itemData = itemDoc.data();
        if (itemData.designStatus === 'CUSTOMER_REVIEW') {
          await adminDb.collection('orders').doc(orderId).collection('items').doc(itemDoc.id).update({
            designStatus: 'DESIGN_IN_PROGRESS'
          });
        }
      }
    }
  } catch (err) {
    console.error('[customerRejectDesign] failed to update subcollection items:', err);
  }

  // Notify the designer about the rejection
  const designerUid = orderData.workflow?.designedBy || orderData.workflow?.assignedTo;
  if (designerUid) {
    await sendNotification(
      designerUid,
      'DESIGN_REJECTED_BY_CUSTOMER',
      `Design revision required for Order #${orderId.slice(-6).toUpperCase()}. Customer feedback: "${notes}"`,
      { orderId, rejectionNotes: notes }
    );
  }

  await writeAuditLog({
    actedAs: user.id,
    actedAsType: 'CUSTOMER',
    actionType: 'DESIGN_PROOF_REJECTED',
    entityType: 'ORDER',
    entityId: orderId,
    meta: { reason: notes, version: orderData?.workflow?.customerApproval?.currentProofVersion || 0 }
  });

  return result;
}

/**
 * ACTION: Designer workflow completion (if no customer approval needed)
 */
export async function finalizePrePress(orderId: string) {
  const user = await getAuthorizedUser(['DESIGNER', 'ADMIN', 'MANAGER']);
  return await transitionOrder(orderId, 'DESIGN_READY', 'Verified Design - Ready for Print', user);
}

function calculateTransitionOrderUpdates(
  orderId: string,
  orderData: any,
  nextStatus: OrderStatus,
  actionLabel: string,
  user: { id: string; name: string; role: UserRole },
  metadata: any = {},
  expectedVersion?: number
) {
  const currentStatus = orderData.status as OrderStatus;
  const paymentMethod = orderData.orderType as any;

  // 1. Validate Transition
  const validation = canTransition(currentStatus, nextStatus, paymentMethod === 'CREDIT' ? 'CREDIT' : 'CASH');
  if (!validation.allowed) {
    // Special-case: orders created by ACDEMA (proxy) should be allowed
    // to progress through production and delivery without the usual
    // payment/accountant gates. Allow these transitions and record
    // a warning in logs instead of throwing.
    const productionStatuses: OrderStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'DISPATCHED'];
    const isAcDemaProxy = Boolean(orderData.createdByRole && orderData.createdByRole === 'ACDEMA');
    if (isAcDemaProxy && (productionStatuses.includes(nextStatus) || nextStatus === 'DELIVERED')) {
      console.warn(`[transitionOrder] Bypassing transition validation for ACDEMA proxy order ${orderId}: ${currentStatus} → ${nextStatus}`);
    } else {
      throw new Error(validation.reason || `Cannot move from ${currentStatus} to ${nextStatus}`);
    }
  }

  if (nextStatus === 'PAYMENT_VERIFIED') {
    throw new Error('PAYMENT_VERIFIED status can only be set through the authorized payment verification action.');
  }

  // 1.5. ACCOUNTANT GATE: Block production pipeline if not yet accountant-approved
  const isAccountantApproved = 
    orderData.status === 'ACCOUNTANT_APPROVED' ||
    ORDER_STATUS_HIERARCHY.indexOf(orderData.status as OrderStatus) > ORDER_STATUS_HIERARCHY.indexOf('ACCOUNTANT_APPROVED') ||
    // Orders created by ACDEMA are considered pre-approved by Accountant
    (orderData.createdByRole && orderData.createdByRole === 'ACDEMA');
  const productionStatuses: OrderStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'DISPATCHED'];
  
  if (productionStatuses.includes(nextStatus) && !isAccountantApproved) {
    throw new Error(`Order ${orderId} has not been approved by the Accountant yet. Production is blocked.`);
  }

  // 2. Perform DB Update (Including History Snapshot)
  const historyEntry: StatusHistoryEntry = {
    from: currentStatus,
    to: nextStatus,
    by: user.id,
    timestamp: admin.firestore.Timestamp.now(),
    notes: metadata.notes || '',
    reasonCode: metadata.reasonCode || ''
  };

  const updateData: any = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    'workflow.history': admin.firestore.FieldValue.arrayUnion(historyEntry),
    ...metadata
  };

  updateData.status = nextStatus;

  if (expectedVersion !== undefined) {
    updateData.expectedVersion = expectedVersion;
  } else if (orderData.version !== undefined) {
    updateData.expectedVersion = orderData.version;
  }

  // Strip undefined values to prevent Firestore errors
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  // Map Workflow Timestamps
  if (nextStatus === 'ASSIGNED') updateData['workflow.assignedAt'] = admin.firestore.FieldValue.serverTimestamp();
  if (nextStatus === 'IN_PROGRESS') updateData['workflow.startedAt'] = admin.firestore.FieldValue.serverTimestamp();
  if (nextStatus === 'COMPLETED') updateData['workflow.completedAt'] = admin.firestore.FieldValue.serverTimestamp();
  if (nextStatus === 'DISPATCHED') updateData['workflow.dispatchedAt'] = admin.firestore.FieldValue.serverTimestamp();
  if (nextStatus === 'DELIVERED') updateData['workflow.deliveredAt'] = admin.firestore.FieldValue.serverTimestamp();

  return { updateData, historyEntry };
}

/**
 * INTERNAL HELPER: The only function allowed to touch order status in DB (Admin Scope).
 */
export async function transitionOrder(
  orderId: string,
  nextStatus: OrderStatus,
  actionLabel: string,
  user: { id: string; name: string; role: UserRole },
  metadata: any = {},
  expectedVersion?: number
) {
  const orderRef = adminDb.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    throw new Error(`Order ${orderId} not found.`);
  }

  const orderData = orderSnap.data() as any;
  const currentStatus = orderData.status as OrderStatus;

  // If expectedVersion was not explicitly passed, use fresh snapshot version to avoid conflict in chained calls
  const freshSnap = expectedVersion !== undefined ? orderSnap : await orderRef.get();
  const freshData = (freshSnap.data() as any) || orderData;

  const { updateData } = calculateTransitionOrderUpdates(
    orderId,
    freshData,
    nextStatus,
    actionLabel,
    user,
    metadata,
    expectedVersion
  );

  await orderRef.update(updateData);

  // 2.5 Incremental Stats Update (Phase 3)
  await adminDb.runTransaction(async (transaction) => {
    const increments: Record<string, number> = {};
    
    // Decrease old status
    if (STATUS_STATS_MAPPING[currentStatus]) {
      STATUS_STATS_MAPPING[currentStatus].forEach(path => {
        increments[path] = -1;
      });
    }

    // Increase new status
    if (STATUS_STATS_MAPPING[nextStatus]) {
      STATUS_STATS_MAPPING[nextStatus].forEach(path => {
        increments[path] = 1;
      });
    }

    if (Object.keys(increments).length > 0) {
      await updateStatsIncrementally(transaction, increments);
    }
  });

  // 2.6 Tally Sync Automation
  // Automatically queue a Tally Sales Invoice sync when the order reaches a final/shipped state.
  // The enqueueTallySync function uses an idempotency key, so it won't duplicate if it triggers twice.
  if (['DISPATCHED', 'DELIVERED', 'COMPLETED'].includes(nextStatus)) {
    try {
      const { enqueueTallySync, buildSalesInvoicePayload } = await import('@/lib/actions/tally-sync');
      
      const itemsSnap = await adminDb.collection('orders').doc(orderId).collection('items').get();
      const items = itemsSnap.docs.map(i => i.data());
      
      if (items.length > 0) {
        const payload = await buildSalesInvoicePayload(orderData, items);
        await enqueueTallySync({
          syncType: 'SALES_INVOICE',
          orderId: orderId,
          payload,
          createdBy: user.id
        });
      }
    } catch (err) {
      console.error(`[Workflow] Failed to enqueue Tally sync for order ${orderId}:`, err);
    }
  }

  // 3. Log Activity
  await logActivity({
    userId: user.id,
    role: user.role,
    action: actionLabel,
    meta: { orderId, nextStatus }
  });

  await writeAuditLog({
    actedAs: user.id,
    actedAsType: 'ROLE',
    actionType: 'ORDER_TRANSITION',
    entityType: 'ORDER',
    entityId: orderId,
    beforeState: { status: currentStatus, workflow: orderData.workflow },
    afterState: { status: nextStatus, ...metadata },
    meta: { actionLabel, orderId, nextStatus }
  });

  // ── Dispatch: Just mark as DISPATCHED via Supabase ──────────────────────
  // Invoice generation is now manual (Invoice Generation module).
  // atomic_dispatch_order RPC still called for idempotency — it no longer
  // reserves an invoice number; it only updates order status.
  if (nextStatus === 'DISPATCHED') {
    const parentId = orderData.baseOrderId || orderId;
    
    // Fix: Only update the SPECIFIC order/item being dispatched.
    // Do NOT use .like with parentId as it auto-dispatches unfinished sibling items!
    await supabaseServer
      .from('orders')
      .update({ status: 'DISPATCHED' })
      .eq('id', orderId);

    const { data: rpcResult, error: rpcError } = await supabaseServer.rpc('atomic_dispatch_order', {
      p_order_id:   parentId,
      p_actor_id:   user.id,
      p_actor_name: user.name || 'Admin',
      p_invoice_date: new Date().toISOString().split('T')[0]
    });
    if (rpcError) {
      console.error(`[Workflow] atomic_dispatch_order RPC failed for ${parentId}:`, rpcError);
      // Non-fatal: status was already set via Firestore above; log and continue.
    } else {
      console.log(`[Workflow] Order ${parentId} marked DISPATCHED.`);
    }
  }



  // ── Tally Sync: Enqueue SALES_INVOICE on Dispatch ──────────────────────
  // Only triggered when order reaches DISPATCHED status.
  // Fire-and-forget — Tally failure must NEVER block the ERP workflow.
  if (nextStatus === 'DISPATCHED') {
    (async () => {
      try {
        // Fetch order + items for payload
        const freshSnap = await adminDb.collection('orders').doc(orderId).get();
        const freshOrder = freshSnap.data() as any;
        const itemsSnap = await adminDb.collection('orders').doc(orderId).collection('items').get();
        const items = itemsSnap.docs.map(d => d.data());

        const invoicePayload = await buildSalesInvoicePayload(freshOrder, items);
        await enqueueTallySync({
          syncType: 'SALES_INVOICE',
          orderId,
          customerId: freshOrder.customerId,
          payload: invoicePayload,
          createdBy: user.id,
        });
      } catch (tallyErr: any) {
        console.error('[transitionOrder] Tally enqueue failed (non-blocking):', tallyErr.message);
      }
    })();
  }

  return { success: true, status: nextStatus };
}

/**
 * ACTION: Create New Order (Admin Transaction)
 */
const USE_V2_WORKFLOW = true;

function buildWorkflowSnapshot(
  productData: any,
  isAcdemaUser: boolean = false
): OrderWorkflowSnapshot {
  const configuredSteps = Array.isArray(productData?.workflowSteps) ? productData.workflowSteps : [];
  
  const fallbackSteps = [
    { id: 'accountant', label: 'Payment Verification', role: 'ACCOUNTANT', description: 'Verify payment', blocking: true },
    { id: 'printer', label: 'Print Queue', role: 'PRINTER', description: 'Printing stage', blocking: true },
  ];

  const sourceSteps = configuredSteps.length > 0 ? configuredSteps : fallbackSteps;
  
  let startIdx = 0;
  if (isAcdemaUser) {
    const printerIdx = sourceSteps.findIndex((step: any) => step.role === 'PRINTER');
    startIdx = printerIdx >= 0 ? printerIdx : 0;
  }

  const steps: OrderWorkflowStep[] = sourceSteps.map((step: any, idx: number) => ({
    id: step.id || `step-${idx + 1}`,
    label: step.label || step.role || `Step ${idx + 1}`,
    role: (step.role as any) || 'PRINTER',
    description: step.description || '',
    blocking: step.blocking !== false,
    status: idx < startIdx ? 'COMPLETED' : idx === startIdx ? 'PENDING' : 'LOCKED',
    completedAt: idx < startIdx ? new Date().toISOString() : undefined,
    completedBy: idx < startIdx ? 'STAFF_PROXY' : undefined,
    notes: idx < startIdx ? 'Auto-completed for staff proxy order.' : '',
  }));

  return {
    steps,
    currentStepIndex: startIdx,
    version: 1,
    templateId: productData?.id ? `product-${productData.id}` : 'default',
    metadata: {},
  };
}

async function executeOrderPlacementTx(
  customerData: { id: string; name: string; type: 'CASH' | 'CREDIT' },
  payload: {
    grandTotal: number;
    items: any[];
    snapshot: any;
    customerSnapshot?: any;
    deliveryPricingSnapshot?: any;
    deliveryChoice?: string;
    shippingAddress?: string;
    transportCharges?: number;
    proxyExecutor?: any;
    productionNotes?: string;
    workflowSnapshot?: OrderWorkflowSnapshot;
    printerCategory?: string;
    idOverride?: string;
    discount?: number;
    voucherDiscount?: number;
    idempotencyKey?: string;
    paymentMethod?: string;
    paymentMode?: string;
    isInterstate?: boolean;
    gstRate?: number;
    refOrderId?: string;
    parentOrderId?: string;
    // Opaque extra data supplied by ACDEMA flow — included in the outbox job atomically
    acdemaJobPayloadExtra?: Record<string, any>;
    preFetchedProducts?: any[];
  }
) {
  // 1. Pre-validation (Validate Everything Before BEGIN)
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'ACDEMA', 'DESIGNER', 'SUPPORT', 'CUSTOMER']);

  if (!payload.items || payload.items.length === 0) {
    throw new Error('At least one item is required.');
  }
  if (payload.items.length > 50) {
    throw new Error('Cart limit exceeded. Maximum 50 items allowed.');
  }

  // Pre-fetch independent requirements
  const productIds = payload.items.map(item => String(item.productId || item.id || '').trim()).filter(Boolean);
  
  // If the logged-in user is the customer, reuse the profile from auth
  const isSelfOrder = user.id === customerData.id;
  
  let customerProfile = isSelfOrder ? user.profile : null;
  let products = payload.preFetchedProducts || null;

  if (isSelfOrder) {
    if (!products) {
      const fetchedProducts = await Promise.all(
        productIds.map(async id => {
          const product = await getCachedProduct(id);
          const steps = await getCachedWorkflow(id);
          return product ? { ...product, workflowSteps: steps } : null;
        })
      );
      if (fetchedProducts.some(p => !p)) throw new Error('Products lookup failed.');
      products = fetchedProducts;
    }
  } else {
    // Parallelize profile and products lookup for proxy orders
    if (!products) {
      const [profileRes, productsRes] = await Promise.all([
        supabaseServer.from('contact').select('*').eq('id', customerData.id).single(),
        Promise.all(productIds.map(async id => {
          const product = await getCachedProduct(id);
          const steps = await getCachedWorkflow(id);
          return product ? { ...product, workflowSteps: steps } : null;
        }))
      ]);
      if (profileRes.error || !profileRes.data) throw new Error('Customer profile not found.');
      if (productsRes.some(p => !p)) throw new Error('Products lookup failed.');
      customerProfile = profileRes.data;
      products = productsRes;
    } else {
      const profileRes = await supabaseServer.from('contact').select('*').eq('id', customerData.id).single();
      if (profileRes.error || !profileRes.data) throw new Error('Customer profile not found.');
      customerProfile = profileRes.data;
    }
  }

  if (!products) {
    throw new Error('Products lookup failed.');
  }
  if (!customerProfile) {
    throw new Error('Customer profile lookup failed.');
  }

  // Pre-validate credit limit (for friendly error)
  const usedCredit = Number(customerProfile.usedCredit || 0);
  const creditLimit = Number(customerProfile.creditLimit || 0);
  if (customerData.type === 'CREDIT' && (usedCredit + payload.grandTotal > creditLimit)) {
    throw new Error(`Credit limit exceeded. Used: ${usedCredit}, Limit: ${creditLimit}`);
  }

  // 2. Pricing Engine calculations
  const pricingItems = payload.items.map(item => {
    const eyeletCount = Number(item.eyeletCount || item.materialMetadata?.eyeletCount || 0);
    const eyeletRate = Number(item.eyeletRate || item.pricingSnapshot?.eyeletRate || 0);
    const finishCharges = eyeletCount * eyeletRate;
    const subTotal = Number(item.subTotal || 0);
    const productTotal = Math.max(0, subTotal - finishCharges);
    
    // Calculate individual item GST rate
    const resolvedProductId = item.productId || item.pricingSnapshot?.productId || item.materialMetadata?.materialType;
    const itemProduct = products.find(p => p.id === String(resolvedProductId || '').trim());
    const itemGstRate = itemProduct?.gst_rate ? itemProduct.gst_rate / 100 : (payload.gstRate ?? 0.18);

    return {
      productTotal,
      designCharges: item.designCharges || 0,
      finishCharges,
      packingCharges: item.packingCharges || 0,
      gstRate: itemGstRate
    };
  });
  const totals = calculateOrderTotals({
    items: pricingItems,
    transport: payload.transportCharges || 0,
    discount: payload.discount || 0,
    voucherDiscount: payload.voucherDiscount || 0,
    isInterstate: payload.isInterstate ?? (payload.customerSnapshot?.state !== 'Maharashtra'),
    gstRate: payload.gstRate ?? 0.18
  });

  // Compare both systems (Pricing Engine Validation rule)
  if (Math.abs(totals.grandTotal - payload.grandTotal) > 0.05) {
    console.warn(`[Pricing Validation] Mismatch: Central Engine = ${totals.grandTotal}, Client Payload = ${payload.grandTotal}`);
  }

  // Generate IDs
  const baseId = payload.idOverride || await generateOrderId();
  const isMultiItem = payload.items.length > 1;

  // 3. Prepare Payloads
  const now = new Date().toISOString();

  // Initial Statuses
  let initialStatus: OrderStatus = 'PLACED';
  let initialPaymentStatus = 'PENDING';
  
  // Treat ADMIN and SUPER_ADMIN the same as ACDEMA — they can skip straight to Printer
  const isAcdemaUser = user.role === 'ACDEMA' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const firstItem = payload.items[0];
  const firstProduct = products.find(p => p.id === String(firstItem?.productId || firstItem?.id || '').trim());
  let parentWorkflowSnapshot = buildWorkflowSnapshot(firstProduct, isAcdemaUser);

  const isCreditPayment = customerData.type === 'CREDIT' || payload.paymentMethod === 'CREDIT' || payload.paymentMode === 'CREDIT';

  const isStaffProxyOrder = ['ACDEMA', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);

  if ((isStaffProxyOrder && payload.paymentMethod !== 'UPI' && payload.paymentMode !== 'UPI') || isCreditPayment) {
    initialStatus = 'ACCOUNTANT_APPROVED';
    initialPaymentStatus = 'VERIFIED';
    
    // Auto-advance all steps before PRINTER in workflowSnapshot
    if (parentWorkflowSnapshot && Array.isArray(parentWorkflowSnapshot.steps)) {
      const steps = [...parentWorkflowSnapshot.steps];
      const currentIdx = parentWorkflowSnapshot.currentStepIndex ?? 0;
      if (currentIdx < steps.length && steps[currentIdx].role === 'ACCOUNTANT') {
        steps[currentIdx] = {
          ...steps[currentIdx],
          status: 'COMPLETED',
          completedAt: now,
          completedBy: 'SYSTEM',
          notes: 'Auto-approved for staff proxy order'
        };
        const nextIdx = currentIdx + 1;
        if (nextIdx < steps.length) {
          steps[nextIdx] = { ...steps[nextIdx], status: 'PENDING' };
          parentWorkflowSnapshot = { ...parentWorkflowSnapshot, steps, currentStepIndex: nextIdx };
        } else {
          parentWorkflowSnapshot = { ...parentWorkflowSnapshot, steps, currentStepIndex: steps.length };
        }
      }
    }
  }

  // Customer Design Files
  const customerDesignFiles = payload.items
    .filter((item: any) => {
      const url = (item?.fileUrl || '').trim();
      return url && url !== 'DESIGN_BY_US';
    })
    .map((item: any) => ({
      url: item.fileUrl,
      fileName: extractFileNameFromUrl(item.fileUrl),
      uploadedAt: now,
      uploadedBy: customerData.id
    }));
  const customerDesignProvided = customerDesignFiles.length > 0;

  // Printer Category routing
  let derivedCategory = payload.printerCategory || null;
  if (!derivedCategory && payload.items[0]) {
    const firstItem = payload.items[0];
    const firstProduct = products.find(p => p.id === String(firstItem.productId || firstItem.id || '').trim());
    if (firstProduct) {
      derivedCategory = firstProduct.printerCategory || null;
    }
    if (!derivedCategory) {
      const prodName = (firstItem.productName || firstItem.name || '').toLowerCase();
      const matType = (firstItem.materialMetadata?.materialType || '').toLowerCase();
      const checkString = `${prodName} ${matType}`;
      if (checkString.includes('eco')) derivedCategory = 'ECO_SOLVENT';
      else if (checkString.includes('uv')) derivedCategory = 'UV_PRINT';
      else if (checkString.includes('latex')) derivedCategory = 'LATEX_PRINT';
      else if (checkString.includes('vinyl') || checkString.includes('dig')) derivedCategory = 'VINYL_PRINT';
      else if (checkString.includes('flex')) derivedCategory = 'FLEX_PRINT';
      else if (checkString.includes('id')) derivedCategory = 'ID_CARDS';
      else if (checkString.includes('solvent')) derivedCategory = 'SOLVENT_PRINT';
      else derivedCategory = 'SOLVENT_PRINT';
    }
  }

  // Parent Order
  const parentOrder = {
    id: baseId,
    customerId: customerData.id,
    customerName: customerData.name,
    customerSnapshot: payload.customerSnapshot || {},
    is_inter_state: payload.customerSnapshot?.state !== 'Maharashtra',
    ref_order_id: payload.refOrderId || null,
    parent_order_id: payload.parentOrderId || null,
    status: initialStatus,
    paymentStatus: initialPaymentStatus,
    orderType: customerData.type,
    orderSource: user.role === 'CUSTOMER' ? 'WEB' : 'COUNTER',
    createdBy: user.id,
    createdByRole: user.role,
    proxyExecutor: payload.proxyExecutor || null,
    printerCategory: derivedCategory,
    amounts: totals,
    cgst_percentage: payload.items.length === 1 ? (payload.isInterstate ?? (payload.customerSnapshot?.state !== 'Maharashtra') ? 0 : (firstProduct?.gst_rate ? firstProduct.gst_rate / 2 : 9)) : null,
    cgst_amount: Number(totals.cgst.toFixed(2)),
    sgst_percentage: payload.items.length === 1 ? (payload.isInterstate ?? (payload.customerSnapshot?.state !== 'Maharashtra') ? 0 : (firstProduct?.gst_rate ? firstProduct.gst_rate / 2 : 9)) : null,
    sgst_amount: Number(totals.sgst.toFixed(2)),
    igst_percentage: payload.items.length === 1 ? (payload.isInterstate ?? (payload.customerSnapshot?.state !== 'Maharashtra') ? (firstProduct?.gst_rate || 18) : 0) : null,
    igst_amount: Number(totals.igst.toFixed(2)),
    gst_type: payload.isInterstate ?? (payload.customerSnapshot?.state !== 'Maharashtra') ? 'IGST' : 'CGST_SGST',
    allocated_logistics_percentage: 100,
    allocated_logistics_amount: Number((payload.transportCharges || 0).toFixed(2)),
    item_amount: Number((totals.productTotal + totals.designCharges + totals.finishCharges + totals.packingCharges).toFixed(2)),
    taxable_value_snapshot: Number(totals.subtotal.toFixed(2)),
    grand_total_snapshot: Number(totals.grandTotal.toFixed(2)),
    delivery: {
      choice: payload.deliveryChoice || 'PICKUP',
      address: payload.shippingAddress || '',
      pricingSnapshot: payload.deliveryPricingSnapshot || null
    },
    workflow: {
      customerDesignProvided,
      customerDesignUrl: customerDesignFiles[0]?.url || null,
      customerDesignFiles,
      designerProofs: [],
      customerApproval: {
        status: 'NOT_REQUIRED',
        currentProofVersion: 0,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: ''
      },
      customerRevisionRequired: false
    },
    workflowSnapshot: parentWorkflowSnapshot,
    currentWorkflowRole: parentWorkflowSnapshot?.steps[parentWorkflowSnapshot?.currentStepIndex ?? 0]?.role || null,
    currentWorkflowLabel: parentWorkflowSnapshot?.steps[parentWorkflowSnapshot?.currentStepIndex ?? 0]?.label || null,
    productionNotes: payload.productionNotes || '',
    thumbnailUrl: payload.items[0]?.fileUrl || null,
    productName: payload.items[0]?.productName || payload.items[0]?.name || null,
    description: payload.items[0]?.projectName || payload.items[0]?.description || null,
    items: payload.items,
    createdAt: now,
    updatedAt: now,
    shippingAddress: payload.shippingAddress || '',
    deliveryChoice: payload.deliveryChoice || 'PICKUP'
  };

  const childOrders: any[] = [];
  const orderItems: any[] = [];

  if (isMultiItem) {
    // Multi-item Order: Create Split Child Orders in `orders` table
    for (let i = 0; i < payload.items.length; i++) {
      const item = payload.items[i];
      const childOrderId = generateChildOrderId(baseId, i + 1);

      // Child Order items array has only this single item
      const childItems = [item];

      // Each child has its own independent workflow & workspace
      const childDesignFiles = [item]
        .filter((it: any) => {
          const url = (it?.fileUrl || '').trim();
          return url && url !== 'DESIGN_BY_US';
        })
        .map((it: any) => ({
          url: it.fileUrl,
          fileName: extractFileNameFromUrl(it.fileUrl),
          uploadedAt: now,
          uploadedBy: customerData.id
        }));

      let childCategory = item.printerCategory || null;
      if (!childCategory) {
        const matchingProduct = products.find(p => p.id === String(item.productId || item.id || '').trim());
        if (matchingProduct) childCategory = matchingProduct.printerCategory || null;
      }

      // Calculate proportional financial values for child orders
      const childPricingItem = pricingItems[i];
      const childIsInterstate = payload.isInterstate ?? (payload.customerSnapshot?.state !== 'Maharashtra');
      const childGstRate = childPricingItem.gstRate ?? (payload.gstRate ?? 0.18);
      const childTotals = calculateOrderTotals({
        items: [childPricingItem],
        transport: (payload.transportCharges || 0) / payload.items.length,
        discount: (payload.discount || 0) / payload.items.length,
        voucherDiscount: (payload.voucherDiscount || 0) / payload.items.length,
        isInterstate: childIsInterstate,
        gstRate: childGstRate
      });

      // ── Immutable financial snapshot (frozen at order creation) ─────────────
      const totalItemCount = payload.items.length;
      const allocatedLogistics = (payload.transportCharges || 0) / totalItemCount;
      const allocatedLogisticsPercent = (payload.grandTotal || 0) > 0
        ? (allocatedLogistics / (payload.grandTotal || 1)) * 100 : 0;

      const cgst_percentage  = childIsInterstate ? 0 : (childGstRate * 100) / 2;
      const sgst_percentage  = childIsInterstate ? 0 : (childGstRate * 100) / 2;
      const igst_percentage  = childIsInterstate ? childGstRate * 100 : 0;
      const cgst_amount      = childIsInterstate ? 0 : Number(childTotals.cgst.toFixed(2));
      const sgst_amount      = childIsInterstate ? 0 : Number(childTotals.sgst.toFixed(2));
      const igst_amount      = childIsInterstate ? Number(childTotals.igst.toFixed(2)) : 0;
      const gst_type         = childIsInterstate ? 'IGST' : 'CGST_SGST';
      const taxable_value_snapshot = Number(childTotals.subtotal.toFixed(2));
      const grand_total_snapshot   = Number(childTotals.grandTotal.toFixed(2));
      const item_amount      = Number((childTotals.productTotal + childTotals.designCharges + childTotals.finishCharges + childTotals.packingCharges).toFixed(2));
      // ────────────────────────────────────────────────────────────────────────

      const childProduct = products.find(p => p.id === String(item.productId || item.id || '').trim());
      const childWorkflowSnapshot = buildWorkflowSnapshot(childProduct, isAcdemaUser);

      if ((user.role === 'ACDEMA' && payload.paymentMethod !== 'UPI' && payload.paymentMode !== 'UPI') || isCreditPayment) {
        if (childWorkflowSnapshot && Array.isArray(childWorkflowSnapshot.steps)) {
          const accStep = childWorkflowSnapshot.steps.find(s => s.role === 'ACCOUNTANT');
          if (accStep) {
            accStep.status = 'COMPLETED';
            accStep.completedAt = new Date().toISOString();
            accStep.completedBy = 'SYSTEM';
          }
        }
      }

      const childOrder = {
        id: childOrderId,
        customerId: customerData.id,
        customerName: customerData.name,
        customerSnapshot: payload.customerSnapshot || {},
        is_inter_state: childIsInterstate,
        ref_order_id: payload.refOrderId || null,
        parent_order_id: baseId,
        status: initialStatus,
        paymentStatus: initialPaymentStatus,
        orderType: customerData.type,
        orderSource: user.role === 'CUSTOMER' ? 'WEB' : 'COUNTER',
        createdBy: user.id,
        createdByRole: user.role,
        proxyExecutor: payload.proxyExecutor || null,
        printerCategory: childCategory || derivedCategory,
        amounts: childTotals,
        // Immutable financial snapshot
        cgst_percentage,
        cgst_amount,
        sgst_percentage,
        sgst_amount,
        igst_percentage,
        igst_amount,
        gst_type,
        allocated_logistics_percentage: Number(allocatedLogisticsPercent.toFixed(4)),
        allocated_logistics_amount: Number(allocatedLogistics.toFixed(2)),
        item_amount,
        taxable_value_snapshot,
        grand_total_snapshot,
        // Invoice state (unset at creation)
        invoice_generated: false,
        invoice_status: 'PENDING',
        delivery: {
          choice: payload.deliveryChoice || 'PICKUP',
          address: payload.shippingAddress || '',
          pricingSnapshot: payload.deliveryPricingSnapshot || null
        },
        workflow: {
          customerDesignProvided: childDesignFiles.length > 0,
          customerDesignUrl: childDesignFiles[0]?.url || null,
          customerDesignFiles: childDesignFiles,
          designerProofs: [],
          customerApproval: {
            status: 'NOT_REQUIRED',
            currentProofVersion: 0,
            approvedAt: null,
            rejectedAt: null,
            rejectionReason: ''
          },
          customerRevisionRequired: false,
          baseOrderId: baseId,
          groupOrderIds: [] as string[]
        },
        workflowSnapshot: childWorkflowSnapshot,
        currentWorkflowRole: childWorkflowSnapshot?.steps[childWorkflowSnapshot?.currentStepIndex ?? 0]?.role || null,
        currentWorkflowLabel: childWorkflowSnapshot?.steps[childWorkflowSnapshot?.currentStepIndex ?? 0]?.label || null,
        productionNotes: payload.productionNotes || '',
        thumbnailUrl: item.fileUrl || null,
        productName: item.productName || item.name || null,
        description: item.projectName || item.description || null,
        items: childItems,
        createdAt: now,
        updatedAt: now,
        shippingAddress: payload.shippingAddress || '',
        deliveryChoice: payload.deliveryChoice || 'PICKUP'
      };

      childOrders.push(childOrder);

      // Prepare order_item record
      orderItems.push({
        id: item.id || `item_${baseId}_${i}`,
        orderId: childOrderId,
        productId: item.productId || item.id,
        productName: item.productName || item.name,
        
        product_snapshot_version: childProduct?.product_snapshot_version || 1,
        order_snapshot_version: 1,
        hsn_code: childProduct?.hsn_code || '',
        hsn_description: childProduct?.hsn_description || '',
        gst_rate: childProduct?.gst_rate || 18,
        gst_effective_from: childProduct?.gst_effective_from || '',
        quantity: item.quantity || 1,
        unit: item.unit || 'Sq.ft',
        width: item.width || 0,
        height: item.height || 0,
        area: item.area || 0,
        rate: item.rate || 0,
        discount: item.discount || 0,
        taxable_value: item.taxable_value || item.subTotal || 0,

        category: item.category || childCategory,
        projectName: item.projectName || item.description,
        specs: item.specs || {},
        materialMetadata: item.materialMetadata || {},
        pricingSnapshot: item.pricingSnapshot || {},
        fileUrl: item.fileUrl || null,
        designUrl: null,
        designStatus: 'WAITING_FOR_DESIGNER',
        designUploadStats: {},
        itemWorkspace: {}
      });
    }

    // Set groupOrderIds list in child orders
    const childIds = childOrders.map(c => c.id);
    childOrders.forEach(c => {
      (c.workflow as any).groupOrderIds = childIds;
    });
    // Set groupOrderIds on parent order
    (parentOrder.workflow as any).groupOrderIds = childIds;

  } else {
    // Single-item order: item references the parent order directly
    const item = payload.items[0];
    orderItems.push({
      id: item.id || `item_${baseId}_0`,
      orderId: baseId,
      productId: item.productId || item.id,
      productName: item.productName || item.name,
      
      product_snapshot_version: firstProduct?.product_snapshot_version || 1,
      order_snapshot_version: 1,
      hsn_code: firstProduct?.hsn_code || '',
      hsn_description: firstProduct?.hsn_description || '',
      gst_rate: firstProduct?.gst_rate || 18,
      gst_effective_from: firstProduct?.gst_effective_from || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'Sq.ft',
      width: item.width || 0,
      height: item.height || 0,
      area: item.area || 0,
      rate: item.rate || 0,
      discount: item.discount || 0,
      taxable_value: item.taxable_value || item.subTotal || 0,

      category: item.category || derivedCategory,
      projectName: item.projectName || item.description,
      specs: item.specs || {},
      materialMetadata: item.materialMetadata || {},
      pricingSnapshot: item.pricingSnapshot || {},
      fileUrl: item.fileUrl || null,
      designUrl: null,
      designStatus: 'WAITING_FOR_DESIGNER',
      designUploadStats: {},
      itemWorkspace: {}
    });
  }

  // 4. Ledger Entries
  const ledgerEntries: any[] = [];
  const saleTxId = `TX-SALE-${baseId}-${Date.now()}`;
  const balanceBefore = usedCredit;
  const balanceAfter = usedCredit + totals.grandTotal;

  // Automatic SALE and RECEIPT generation during order placement has been removed.
  // Sales are strictly recognized when Invoices are generated.
  // Proxy Order advance receipts are handled separately in acdema.ts post-processing
  // using the standard createReceiptEntry workflow.

  // 5. Background Jobs (Transactional Outbox)
  const jobs: Array<{ jobId: string; jobType: string; orderId: string; priority: number; payload: Record<string, any> }> = [
    {
      jobId: generateJobId('UPDATE_ANALYTICS', baseId),
      jobType: 'UPDATE_ANALYTICS',
      orderId: baseId,
      priority: 3, // Priority 3 = Medium
      payload: {}
    }
    // SEND_NOTIFICATION removed (Future Module / Currently Disabled)
  ];

  // Transactional Outbox: include ACDEMA_POST_PROCESS in the same atomic transaction
  // so order creation and background-job enqueue are never split across a crash window.
  if (payload.acdemaJobPayloadExtra) {
    const generatedOrderIds = isMultiItem ? childOrders.map((c) => c.id) : [baseId];
    jobs.push({
      jobId: `ACDEMA_SYNC_${baseId}_${Date.now()}`,
      jobType: 'ACDEMA_POST_PROCESS',
      orderId: baseId,
      priority: 1, // Priority 1 = Highest — run before analytics/notifications
      payload: {
        ...payload.acdemaJobPayloadExtra,
        baseId,
        generatedOrderIds,
        isMultiItem,
      }
    });
  }

  // 6. Execute RPC call in Supabase (the single ACID transaction block)
  const { data: dbResult, error: dbError } = await supabaseServer.rpc('place_order_tx', {
    p_customer_id: customerData.id,
    p_order_type: customerData.type,
    p_grand_total: totals.grandTotal,
    p_parent_order: parentOrder,
    p_child_orders: childOrders.length > 0 ? childOrders : null,
    p_order_items: orderItems.length > 0 ? orderItems : null,
    p_ledger_entries: ledgerEntries.length > 0 ? ledgerEntries : null,
    p_jobs: jobs.length > 0 ? jobs : null,
    p_idempotency_key: payload.idempotencyKey || null
  });

  if (dbError) {
    console.error('[place_order_tx] RPC transaction failed:', dbError);
    throw new Error(`Order placement failed: ${dbError.message}`);
  }

  const dbRes = dbResult as any;
  if (dbRes && dbRes.success === false) {
    console.error('[place_order_tx] RPC returned internal error:', dbRes.error);
    throw new Error(`Order placement failed: ${dbRes.error}`);
  }

  return {
    success: true,
    orderId: dbRes?.orderId || baseId,
    orderIds: isMultiItem ? childOrders.map(c => c.id) : [dbRes?.orderId || baseId],
    duplicate: !!dbRes?.duplicate,
    itemBreakdown: isMultiItem ? childOrders.map(c => ({
      orderId: c.id,
      productName: c.productName,
      quantity: c.items[0]?.quantity || 1,
      amount: c.amounts.grandTotal
    })) : []
  };
}

export async function createOrder(
  customerData: { id: string; name: string; type: 'CASH' | 'CREDIT' },
  payload: any
) {
  return executeOrderPlacementTx(customerData, payload);
}

export async function createCustomerGroupedOrders(
  customerData: { id: string; name: string; type: 'CASH' | 'CREDIT' },
  payload: any
) {
  return executeOrderPlacementTx(customerData, payload);
}

function calculateWorkflowAdvance(
  workflowSnapshot: any,
  role: string,
  status: 'COMPLETED' | 'IN_PROGRESS' | 'ON_HOLD' | 'PAUSED',
  userId: string,
  notes?: string
): any {
  if (!workflowSnapshot?.steps) return {};
  
  // Deep clone to ensure pure function without side-effects
  const snapshot = JSON.parse(JSON.stringify(workflowSnapshot));
  
  const currentIdx = snapshot.currentStepIndex;
  if (currentIdx >= 0 && currentIdx < snapshot.steps.length) {
    const currentStep = snapshot.steps[currentIdx];
    if (currentStep.role === role) {
      snapshot.steps[currentIdx].status = status;
      if (status === 'COMPLETED') {
        snapshot.steps[currentIdx].completedAt = new Date().toISOString();
        snapshot.steps[currentIdx].completedBy = userId;
        // Unlock the next step if exists
        const nextIdx = currentIdx + 1;
        if (nextIdx < snapshot.steps.length) {
          snapshot.steps[nextIdx].status = 'PENDING';
          snapshot.currentStepIndex = nextIdx;
        } else {
          snapshot.currentStepIndex = snapshot.steps.length;
        }
      } else if (status === 'IN_PROGRESS') {
        snapshot.steps[currentIdx].startedAt = new Date().toISOString();
      }
      if (notes) {
        snapshot.steps[currentIdx].notes = notes;
      }
      
      const updateData: any = {
        workflowSnapshot: snapshot
      };
      const activeStep = snapshot.currentStepIndex < snapshot.steps.length 
        ? snapshot.steps[snapshot.currentStepIndex] 
        : null;
      if (activeStep) {
        updateData.currentWorkflowRole = activeStep.role;
        updateData.currentWorkflowLabel = activeStep.label;
      } else {
        updateData.currentWorkflowRole = null;
        updateData.currentWorkflowLabel = null;
      }
      
      return updateData;
    }
  }
  return {};
}

// Helper for advancing dynamic workflow snapshot steps
async function advanceWorkflowSnapshotStep(
  orderId: string,
  role: string,
  status: 'COMPLETED' | 'IN_PROGRESS' | 'ON_HOLD' | 'PAUSED',
  user: { id: string },
  notes?: string
) {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const orderRef = adminDb.collection('orders').doc(orderId);
      await adminDb.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(orderRef);
        if (!freshSnap.exists) return;
        const freshData = freshSnap.data() as any;
        if (freshData?.workflowSnapshot?.steps) {
          const updateData = calculateWorkflowAdvance(freshData.workflowSnapshot, role, status, user.id, notes);
          if (Object.keys(updateData).length > 0) {
            transaction.update(orderRef, updateData);
          }
        }
      });
      return; // success
    } catch (err: any) {
      const isVersionConflict = err?.message?.includes('modified by another user') || err?.message?.includes('version');
      if (isVersionConflict && attempt < MAX_RETRIES) {
        // Brief backoff before retrying with fresh data
        await new Promise(res => setTimeout(res, 150 * attempt));
        console.warn(`[advanceWorkflowSnapshotStep] Version conflict on attempt ${attempt}, retrying...`);
        continue;
      }
      console.warn('[advanceWorkflowSnapshotStep] Failed:', err);
      // Non-version errors or exhausted retries — don't throw, let caller continue
      return;
    }
  }
}

export async function advanceOrderWorkflow(orderId: string, notes?: string, metadata?: any) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'DELIVERY', 'SUPPORT']);
  
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) throw new Error('Order not found');
  const orderData = orderSnap.data() as any;
  
  const role = orderData.currentWorkflowRole || user.role;
  await advanceWorkflowSnapshotStep(orderId, role, 'COMPLETED', user, notes || 'Advanced workflow step');
  
  // Re-fetch to get the newly updated workflow snapshot pointer
  const freshSnap = await adminDb.collection('orders').doc(orderId).get();
  const freshData = freshSnap.data() as any;
  const nextRole = freshData.currentWorkflowRole;

  let nextStatus: OrderStatus = freshData.status || orderData.status;
  
  if (nextRole === 'DESIGNER') {
    nextStatus = 'DESIGNING';
  } else if (nextRole === 'PRINTER' || nextRole === 'PASTING' || nextRole === 'FINISHING') {
    nextStatus = 'IN_PROGRESS';
  } else if (nextRole === 'DISPATCH') {
    nextStatus = 'COMPLETED'; // Production is done, ready for dispatch
  } else if (nextRole === 'DELIVERY') {
    const isDeliverySkipped = ['pickup', 'transport', 'courier', 'counter'].includes((orderData.dispatchInfo?.method || orderData.deliveryChoice || '').toLowerCase());
    if (isDeliverySkipped) {
      nextStatus = 'DELIVERED';
      if (!metadata) metadata = {};
      metadata['workflow.deliveredAt'] = admin.firestore.FieldValue.serverTimestamp();
    } else {
      nextStatus = 'DISPATCHED';
    }
  } else if (!nextRole) {
    // If no next role, fallback to legacy sequential logic
    if (role === 'DESIGNER') {
      nextStatus = 'DESIGN_READY';
    } else if (role === 'MANAGER' || role === 'MANAGER_SIGN_OFF' || role === 'MANAGER SIGN-OFF') {
      nextStatus = 'ASSIGNED';
    } else if (orderData.status === 'ASSIGNED' || orderData.status === 'IN_PROGRESS') {
      nextStatus = 'COMPLETED';
    } else if (orderData.status === 'COMPLETED') {
      nextStatus = 'DISPATCHED';
    } else if (orderData.status === 'DISPATCHED' || orderData.status === 'IN_TRANSIT') {
      nextStatus = 'DELIVERED';
    }
  }
  
  if (nextStatus === freshData.status) {
    return { success: true, message: 'Workflow advanced without status change' }; // No need to execute a status transition if it's already in the correct state
  }

  return await transitionOrder(orderId, nextStatus, notes || 'Advanced workflow step', user, metadata);
}

export async function startWorkflowStep(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'DELIVERY', 'SUPPORT']);
  
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) throw new Error('Order not found');
  const orderData = orderSnap.data() as any;
  
  const role = orderData.currentWorkflowRole || user.role;
  await advanceWorkflowSnapshotStep(orderId, role, 'IN_PROGRESS', user, notes || 'Started work step');
  
  let nextStatus: OrderStatus = 'IN_PROGRESS';
  if (role === 'DESIGNER') {
    nextStatus = 'DESIGNING';
  } else if (orderData.status === 'DISPATCHED') {
    nextStatus = 'IN_TRANSIT';
  } else if (orderData.status === 'ACCOUNTANT_APPROVED' || orderData.status === 'DESIGN_READY') {
    nextStatus = 'DESIGNING';
  } else if (orderData.status === 'PAYMENT_VERIFIED') {
    nextStatus = 'ASSIGNED';
  } else if (orderData.status === 'COMPLETED' || orderData.status === 'DISPATCHED' || orderData.status === 'IN_TRANSIT' || orderData.status === 'DELIVERED') {
    nextStatus = orderData.status;
  }
  
  if (nextStatus === orderData.status) {
    return; // No need to transition if the status is the same, just the snapshot step was updated
  }
  
  return await transitionOrder(orderId, nextStatus, notes || 'Started work step', user);
}

export async function resumeWorkflowStep(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'DELIVERY', 'SUPPORT']);
  
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) throw new Error('Order not found');
  const orderData = orderSnap.data() as any;
  
  const role = orderData.currentWorkflowRole || user.role;
  await advanceWorkflowSnapshotStep(orderId, role, 'IN_PROGRESS', user, notes || 'Resumed work step');
  
  let nextStatus: OrderStatus = 'IN_PROGRESS';
  if (role === 'DESIGNER') {
    nextStatus = 'DESIGNING';
  } else if (orderData.status === 'DISPATCHED') {
    nextStatus = 'IN_TRANSIT';
  } else if (orderData.status === 'ACCOUNTANT_APPROVED' || orderData.status === 'DESIGN_READY') {
    nextStatus = 'DESIGNING';
  } else if (orderData.status === 'PAYMENT_VERIFIED') {
    nextStatus = 'ASSIGNED';
  } else if (orderData.status === 'COMPLETED' || orderData.status === 'DISPATCHED' || orderData.status === 'IN_TRANSIT' || orderData.status === 'DELIVERED') {
    nextStatus = orderData.status;
  }
  
  if (nextStatus === orderData.status) {
    return { success: true, message: 'Workflow resumed without status change' };
  }
  
  return await transitionOrder(orderId, nextStatus, notes || 'Resumed work step', user);
}

export async function designerApproveCustomerArtwork(orderId: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('DESIGNER', orderSnap.data()?.workflowSnapshot);
  }
  await advanceWorkflowSnapshotStep(orderId, 'DESIGNER', 'COMPLETED', user, 'Designer approved customer artwork');
  return await transitionOrder(orderId, 'DESIGN_READY', 'Designer approved customer artwork', user);
}

export async function designerSendToManager(orderId: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('DESIGNER', orderSnap.data()?.workflowSnapshot);
  }
  await advanceWorkflowSnapshotStep(orderId, 'DESIGNER', 'COMPLETED', user, 'Designer sent to manager');
  return await transitionOrder(orderId, 'DESIGN_READY', 'Designer sent to manager', user);
}

export async function requestCustomerRedesign(orderId: string, notes: string, requirements: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('DESIGNER', orderSnap.data()?.workflowSnapshot);
  }
  return await transitionOrder(orderId, 'PLACED', `Requested customer redesign: ${notes}`, user, { 
    'workflow.customerRevisionRequired': true, 
    'workflow.designRequirements': requirements 
  });
}

export async function assignPrinter(orderId: string, printerId: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('MANAGER', orderSnap.data()?.workflowSnapshot);
  }
  
  let printerName = 'Printer';
  try {
    const profileSnap = await adminDb.collection('profiles').doc(printerId).get();
    if (profileSnap.exists) {
      const profileData = profileSnap.data() as any;
      printerName = profileData.displayName || profileData.name || 'Printer';
    }
  } catch (err) {
    console.error('Error fetching printer profile:', err);
  }

  const meta = {
    'workflow.assignedTo': printerId,
    'workflow.assignedToName': printerName,
    'workflow.assignedBy': user.id,
    'workflow.assignedByName': user.name,
    'workflow.assignedAt': admin.firestore.FieldValue.serverTimestamp()
  };

  return await transitionOrder(orderId, 'ASSIGNED', `Assigned printer ${printerName}`, user, meta);
}

export async function assignTiffToPrinter(orderId: string, tiffPath: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('MANAGER', orderSnap.data()?.workflowSnapshot);
  }
  const timelineEntry = {
    event: 'TIFF_ASSIGNED',
    timestamp: new Date().toISOString(),
    user: user.id,
    notes: `TIFF path assigned: ${tiffPath}`,
    tiffPath
  };
  return await adminDb.collection('orders').doc(orderId).update({
    'workflow.printWorkflow.status': 'TIFF_READY',
    'workflow.printWorkflow.tiffPath': tiffPath,
    'workflow.printWorkflow.tiffFileName': getFileNameFromPath(tiffPath),
    'workflow.printWorkflow.convertedBy': user.id,
    'workflow.printWorkflow.convertedAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.printWorkflow.timeline': admin.firestore.FieldValue.arrayUnion(timelineEntry)
  });
}

export async function assignItemTiffToPrinter(orderId: string, itemId: string, tiffPath: string, printerId?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER']);
  const orderRef = adminDb.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (orderSnap.exists) {
    checkStageNotCompleted('MANAGER', orderSnap.data()?.workflowSnapshot);
  }
  const itemRef = adminDb.collection('orders').doc(orderId).collection('items').doc(itemId);
  
  const updateData: any = {
    tiffPath,
    tiffAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
    tiffAssignedBy: user.id
  };

  if (printerId) {
    updateData.assignedPrinterId = printerId;
    try {
      const profileSnap = await adminDb.collection('profiles').doc(printerId).get();
      if (profileSnap.exists) {
        const profileData = profileSnap.data() as any;
        updateData.assignedPrinterName = profileData.displayName || profileData.name || 'Printer';
      }
    } catch (err) {
      console.error('Error fetching printer profile:', err);
    }
  }

  await itemRef.update(updateData);
  
  try {
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(orderRef);
      if (snap.exists) {
        const orderData = snap.data() as any;
        const workflow = orderData.workflow || {};
        const printWorkflow = workflow.printWorkflow || orderData.printWorkflow || {};
        const itemAssignments = Array.isArray(printWorkflow.itemAssignments) 
          ? [...printWorkflow.itemAssignments] 
          : [];
        
        const filtered = itemAssignments.filter((a: any) => a.itemId !== itemId);
        
        filtered.push({
          itemId,
          tiffPath,
          printerId: printerId || '',
          printerName: updateData.assignedPrinterName || '',
          assignedBy: user.id,
          assignedAt: new Date().toISOString()
        });
        
        printWorkflow.itemAssignments = filtered;
        
        const updateFields: any = {
          'workflow.printWorkflow': printWorkflow
        };

        transaction.update(orderRef, updateFields);
      }
    });
  } catch (err) {
    console.error('Error updating parent order itemAssignments:', err);
  }

  return { success: true, path: tiffPath };
}

export async function holdOrderWorkflow(orderId: string, reasonCode: RejectionReason, notes: string) {
  const user = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER']);
  return await transitionOrder(orderId, 'ON_HOLD', 'Order Placed On Hold', user, {
    'workflow.holdAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.holdBy': user.id,
    reasonCode,
    notes
  });
}

export async function rejectOrderWorkflow(orderId: string, reasonCode: RejectionReason, notes: string) {
  const user = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'MANAGER']);
  return await transitionOrder(orderId, 'REJECTED', 'Order Rejected', user, {
    'workflow.rejectedAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.rejectedBy': user.id,
    reasonCode,
    notes
  });
}

export async function dispatchOrder(orderId: string, dispatchInfo: any) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'SUPPORT', 'DISPATCH']);
  
  await advanceWorkflowSnapshotStep(orderId, 'DISPATCH', 'COMPLETED', user, 'Order Dispatched');
  
  const snap = await adminDb.collection('orders').doc(orderId).get();
  const currentStatus = snap.data()?.status;
  const orderData = snap.data() as any;
  
  const isDeliverySkipped = ['pickup', 'transport', 'courier', 'counter'].includes((dispatchInfo?.method || orderData?.deliveryChoice || '').toLowerCase());
  
  const { dispatchProofUrl, ...restDispatchInfo } = dispatchInfo;
  
  const meta: any = {
    dispatchInfo: restDispatchInfo,
    'workflow.dispatchedAt': admin.firestore.FieldValue.serverTimestamp()
  };

  if (dispatchProofUrl) {
    meta['workflow.dispatchProofUrl'] = dispatchProofUrl;
  }

  if (isDeliverySkipped) {
    meta['workflow.deliveredAt'] = admin.firestore.FieldValue.serverTimestamp();
  }

  let result;
  if (currentStatus === 'IN_TRANSIT' || currentStatus === 'DELIVERED' || (currentStatus === 'DISPATCHED' && !isDeliverySkipped)) {
    await adminDb.collection('orders').doc(orderId).update(meta);
    result = { success: true };
  } else {
    const targetStatus = isDeliverySkipped ? 'DELIVERED' : 'DISPATCHED';
    result = await transitionOrder(orderId, targetStatus, 'Order Dispatched', user, meta);
  }

  // Legacy dispatch receipt logic removed permanently

  return result;
}

export async function deliverOrder(orderId: string, notes?: string, proofUrl?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'SUPPORT', 'DELIVERY']);
  const meta: any = { notes: notes || '' };
  if (proofUrl) {
    meta['workflow.deliveryProof'] = {
      url: proofUrl,
      uploadedBy: user.id,
      uploadedByName: user.name,
      uploadedAt: new Date().toISOString()
    };
  }
  await advanceWorkflowSnapshotStep(orderId, 'DELIVERY', 'COMPLETED', user, notes || 'Delivered to customer');
  
  const snap = await adminDb.collection('orders').doc(orderId).get();
  const orderData = snap.data();
  
  let result;
  if (orderData?.status === 'DELIVERED') {
    await adminDb.collection('orders').doc(orderId).update(meta);
    result = { success: true };
  } else {
    result = await transitionOrder(orderId, 'DELIVERED', 'Order Delivered', user, meta);
  }
  
  // Legacy sales receipt logic removed permanently
  
  return result;
}

export async function markInTransit(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'SUPPORT', 'DISPATCH', 'DELIVERY']);
  
  const snap = await adminDb.collection('orders').doc(orderId).get();
  if (snap.data()?.status === 'IN_TRANSIT' || snap.data()?.status === 'DELIVERED') {
    return { success: true };
  }
  
  return await transitionOrder(orderId, 'IN_TRANSIT', notes || 'Order marked In Transit', user);
}

export async function customerReuploadDesign(orderId: string, url: string) {
  const user = await getAuthorizedUser(['CUSTOMER', 'ADMIN', 'MANAGER']);
  const now = admin.firestore.FieldValue.serverTimestamp();
  
  const fileEntry = {
    url,
    fileName: extractFileNameFromUrl(url),
    uploadedAt: now,
    uploadedBy: user.id
  };

  const meta = {
    'workflow.customerDesignUrl': url,
    'workflow.customerDesignFiles': admin.firestore.FieldValue.arrayUnion(fileEntry),
    'workflow.customerRevisionRequired': false,
    'workflow.customerApproval.status': 'PENDING'
  };

  return await transitionOrder(orderId, 'DESIGNING', 'Customer Re-uploaded Corrected Design', user, meta);
}

export async function markTiffOpened(orderId: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'PRINTER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('PRINTER', orderSnap.data()?.workflowSnapshot);
  }
  const timelineEntry = {
    event: 'TIFF_OPENED',
    timestamp: new Date().toISOString(),
    user: user.id,
    notes: 'TIFF opened by printer'
  };
  return await adminDb.collection('orders').doc(orderId).update({
    'workflow.printWorkflow.status': 'PRINT_STARTED',
    'workflow.printWorkflow.printerOpened': true,
    'workflow.printWorkflow.printerOpenedAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.printWorkflow.printerAcceptedBy': user.id,
    'workflow.printWorkflow.printerAcceptedByName': user.name,
    'workflow.printWorkflow.timeline': admin.firestore.FieldValue.arrayUnion(timelineEntry)
  });
}

export async function startTiffPrint(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'PRINTER']);
  
  const orderRef = adminDb.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new Error('Order not found');
  const orderData = orderSnap.data() as any;
  checkStageNotCompleted('PRINTER', orderData.workflowSnapshot);

  const timelineEntry = {
    event: 'PRINT_STARTED',
    timestamp: new Date().toISOString(),
    user: user.id,
    notes: notes || 'Print started'
  };

  if (orderData.status === 'PAYMENT_VERIFIED') {
    // Auto-assign to this printer
    const meta = {
      'workflow.assignedTo': user.id,
      'workflow.assignedToName': user.name,
      'workflow.assignedBy': user.id,
      'workflow.assignedByName': user.name,
      'workflow.assignedAt': admin.firestore.FieldValue.serverTimestamp()
    };
    await transitionOrder(orderId, 'ASSIGNED', `Assigned printer ${user.name} (auto)`, user, meta);
  }

  await advanceWorkflowSnapshotStep(orderId, 'PRINTER', 'IN_PROGRESS', user, notes || 'Started printing TIFF');
  
  if (orderData.status !== 'IN_PROGRESS' && orderData.status !== 'COMPLETED' && orderData.status !== 'DISPATCHED' && orderData.status !== 'DELIVERED') {
    await transitionOrder(orderId, 'IN_PROGRESS', 'Started printing TIFF', user);
  }
  
  return await orderRef.update({
    'workflow.printWorkflow.status': 'PRINT_STARTED',
    'workflow.printWorkflow.sentToPrinter': true,
    'workflow.printWorkflow.sentToPrinterAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.printWorkflow.sentToPrinterBy': user.id,
    'workflow.printWorkflow.timeline': admin.firestore.FieldValue.arrayUnion(timelineEntry)
  });
}

export async function completeTiffPrint(
  orderId: string, 
  notes?: string, 
  materialUsage?: { paperUsed?: string; inkUsed?: string; wastageNotes?: string }
) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'PRINTER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('PRINTER', orderSnap.data()?.workflowSnapshot);
  }
  const timelineEntry = {
    event: 'PRINT_COMPLETED',
    timestamp: new Date().toISOString(),
    user: user.id,
    notes: notes || 'Print completed'
  };

  await fastCompleteProductionStage(orderId, notes || 'Finished printing TIFF', {
    'workflow.printWorkflow.status': 'PRINT_COMPLETED',
    'workflow.printWorkflow.printerCompleted': true,
    'workflow.printWorkflow.printerCompletedAt': admin.firestore.FieldValue.serverTimestamp(),
    'workflow.printWorkflow.printerCompletedBy': user.id,
    'workflow.printWorkflow.printerCompletedByName': user.name,
    'workflow.printWorkflow.materialUsage': materialUsage || null,
    'workflow.printWorkflow.timeline': admin.firestore.FieldValue.arrayUnion(timelineEntry)
  });
}

export async function pauseJob(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'PRINTER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('PRINTER', orderSnap.data()?.workflowSnapshot);
  }
  return await transitionOrder(orderId, 'PRODUCTION_PAUSED', notes || 'Print job paused', user);
}

export async function resumeJob(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'PRINTER']);
  const orderSnap = await adminDb.collection('orders').doc(orderId).get();
  if (orderSnap.exists) {
    checkStageNotCompleted('PRINTER', orderSnap.data()?.workflowSnapshot);
  }
  return await transitionOrder(orderId, 'IN_PROGRESS', notes || 'Print job resumed', user);
}

export async function addWorkflowAttachment(orderId: string, url: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'SUPPORT']);
  const orderRef = adminDb.collection('orders').doc(orderId);
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists) throw new Error('Order not found');
    const data = snap.data() as any;
    if (data.workflowSnapshot?.steps) {
      const snapshot = data.workflowSnapshot as OrderWorkflowSnapshot;
      const currentIdx = snapshot.currentStepIndex;
      if (currentIdx >= 0 && currentIdx < snapshot.steps.length) {
        const step = snapshot.steps[currentIdx];
        checkStageNotCompleted(step.role, snapshot);
        const attachments = Array.isArray(step.attachments) ? [...step.attachments] : [];
        attachments.push(url);
        step.attachments = attachments;
        snapshot.steps[currentIdx] = step;
        transaction.update(orderRef, { workflowSnapshot: snapshot });
      }
    }
  });
}

export async function removeWorkflowAttachment(orderId: string, url: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'SUPPORT']);
  const orderRef = adminDb.collection('orders').doc(orderId);
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists) throw new Error('Order not found');
    const data = snap.data() as any;
    if (data.workflowSnapshot?.steps) {
      const snapshot = data.workflowSnapshot as OrderWorkflowSnapshot;
      const currentIdx = snapshot.currentStepIndex;
      if (currentIdx >= 0 && currentIdx < snapshot.steps.length) {
        const step = snapshot.steps[currentIdx];
        checkStageNotCompleted(step.role, snapshot);
        const attachments = Array.isArray(step.attachments) ? [...step.attachments] : [];
        step.attachments = attachments.filter(a => a !== url);
        snapshot.steps[currentIdx] = step;
        transaction.update(orderRef, { workflowSnapshot: snapshot });
      }
    }
  });
}

/**
 * HIGH-PERFORMANCE "WORK DONE" PATH FOR PRODUCTION (PRINTER, PASTING, FINISHING, DISPATCH)
 * Bundles calculateWorkflowAdvance and calculateTransitionOrderUpdates into a single transaction.
 */
export async function fastCompleteProductionStage(orderId: string, notes?: string, customUpdateData?: any) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'DELIVERY', 'SUPPORT']);

  let transitionSideEffects = { nextStatus: null as OrderStatus | null };
  const orderRef = adminDb.collection('orders').doc(orderId);

  await adminDb.runTransaction(async (transaction) => {
    const freshSnap = await transaction.get(orderRef);
    if (!freshSnap.exists) throw new Error('Order not found');
    const freshData = freshSnap.data() as any;
    const role = freshData.currentWorkflowRole || user.role;

    let mergedUpdateData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (customUpdateData) {
      mergedUpdateData = { ...mergedUpdateData, ...customUpdateData };
    }
    
    let increments: any = null;

    // 1. Calculate Workflow Advance (Snapshot)
    if (freshData?.workflowSnapshot?.steps) {
      const snapUpdateData = calculateWorkflowAdvance(freshData.workflowSnapshot, role, 'COMPLETED', user.id, notes || 'Advanced workflow step');
      if (Object.keys(snapUpdateData).length > 0) {
        mergedUpdateData = { ...mergedUpdateData, ...snapUpdateData };
      }
    }

    // 2. Determine Next Status based on new workflow role
    const nextRole = mergedUpdateData.currentWorkflowRole !== undefined ? mergedUpdateData.currentWorkflowRole : freshData.currentWorkflowRole;
    let nextStatus: OrderStatus = freshData.status;

    if (nextRole === 'DESIGNER') {
      nextStatus = 'DESIGNING';
    } else if (nextRole === 'PRINTER' || nextRole === 'PASTING' || nextRole === 'FINISHING') {
      nextStatus = 'IN_PROGRESS';
    } else if (nextRole === 'DISPATCH') {
      nextStatus = 'COMPLETED'; // Production is done, ready for dispatch
    } else if (nextRole === 'DELIVERY') {
      const isDeliverySkipped = ['pickup', 'transport', 'courier', 'counter'].includes((freshData.dispatchInfo?.method || freshData.deliveryChoice || '').toLowerCase());
      if (isDeliverySkipped) {
        nextStatus = 'DELIVERED';
        mergedUpdateData['workflow.deliveredAt'] = admin.firestore.FieldValue.serverTimestamp();
      } else {
        nextStatus = 'DISPATCHED';
      }
    } else if (!nextRole) {
      if (role === 'DESIGNER') {
        nextStatus = 'DESIGN_READY';
      } else if (role === 'MANAGER' || role === 'MANAGER_SIGN_OFF' || role === 'MANAGER SIGN-OFF') {
        nextStatus = 'ASSIGNED';
      } else if (freshData.status === 'ASSIGNED' || freshData.status === 'IN_PROGRESS') {
        nextStatus = 'COMPLETED';
      } else if (freshData.status === 'COMPLETED') {
        nextStatus = 'DISPATCHED';
      } else if (freshData.status === 'DISPATCHED' || freshData.status === 'IN_TRANSIT') {
        nextStatus = 'DELIVERED';
      }
    }

    // 3. Calculate Transition Order Updates if status changed
    if (nextStatus !== freshData.status) {
      const transCalc = calculateTransitionOrderUpdates(
        orderId,
        freshData,
        nextStatus,
        notes || 'Advanced workflow step',
        user,
        {}
      );

      mergedUpdateData = { ...mergedUpdateData, ...transCalc.updateData };
      transitionSideEffects.nextStatus = nextStatus;

      increments = {};
      if (STATUS_STATS_MAPPING[freshData.status]) {
        STATUS_STATS_MAPPING[freshData.status].forEach(path => { increments[path] = -1; });
      }
      if (STATUS_STATS_MAPPING[nextStatus]) {
        STATUS_STATS_MAPPING[nextStatus].forEach(path => { increments[path] = 1; });
      }
    }

    // 4. Update the Order
    transaction.update(orderRef, mergedUpdateData);

    // 5. Update Stats
    if (increments && Object.keys(increments).length > 0) {
      await updateStatsIncrementally(transaction, increments);
    }
  });

  // 6. Execute Side Effects outside of transaction
  const nextStatus = transitionSideEffects.nextStatus;
  if (nextStatus) {
    const actionLabel = notes || 'Advanced workflow step';
    await logActivity({ userId: user.id, role: user.role, action: actionLabel, meta: { orderId, nextStatus } });
    
    // We fetch again to get accurate state for audit log, though not strictly required, it's safer.
    const finalSnap = await orderRef.get();
    const finalData = finalSnap.data() as any;
    
    await writeAuditLog({
      actedAs: user.id,
      actedAsType: 'ROLE',
      actionType: 'ORDER_TRANSITION',
      entityType: 'ORDER',
      entityId: orderId,
      beforeState: { status: 'UNKNOWN' }, // Omitting complex before state for fast path
      afterState: { status: nextStatus },
      meta: { actionLabel, orderId, nextStatus }
    });

    if (nextStatus === 'DISPATCHED') {
      const parentId = finalData?.baseOrderId || orderId;
      await supabaseServer.from('orders').update({ status: 'DISPATCHED' }).eq('id', orderId);
      
      const { error: rpcError } = await supabaseServer.rpc('atomic_dispatch_order', {
        p_order_id: parentId,
        p_actor_id: user.id,
        p_actor_name: user.name || 'Admin',
        p_invoice_date: new Date().toISOString().split('T')[0]
      });
      if (rpcError) console.error(`[Workflow] atomic_dispatch_order RPC failed for ${parentId}:`, rpcError);

      (async () => {
        try {
          const itemsSnap = await adminDb.collection('orders').doc(orderId).collection('items').get();
          const items = itemsSnap.docs.map(d => d.data());
          const invoicePayload = await buildSalesInvoicePayload(finalData, items);
          await enqueueTallySync({ syncType: 'SALES_INVOICE', orderId, customerId: finalData?.customerId, payload: invoicePayload, createdBy: user.id });
        } catch (tallyErr: any) {
          console.error('[fastCompleteProductionStage] Tally enqueue failed (non-blocking):', tallyErr.message);
        }
      })();
    }
  }

  return { success: true };
}

