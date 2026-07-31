'use server';

// Supabase Workflow Operations - Complete Firebase to Supabase Migration
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

import { supabase } from './supabase';
import { logActivity } from './logger';
import { writeAuditLog } from './audit-log';
import { updateStatsIncrementally, detectAnomalies } from './stats';
import { UserProfile, UserRole, getEffectiveRoles } from '@/types/auth';
import { cookies } from 'next/headers';
import { enqueueTallySync, buildSalesInvoicePayload } from '@/lib/actions/tally-sync';
import { getFileNameFromPath, inspectTiffPath, isValidTiffPath, resolvePrintWorkflow } from './tiff-utils';


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
async function getAuthorizedUser(allowedRoles?: UserRole[]) {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) throw new Error('Authentication required.');

  try {
    // Verify token via Supabase Auth
    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
    
    if (error || !authUser) {
      throw new Error('Invalid or expired session.');
    }

    // Fetch profile from database
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    const profile = profileData as UserProfile | null;
    const effectiveRoles = getEffectiveRoles(profile);
    const role = (profile?.role ?? 'CUSTOMER') as UserRole;

    if (allowedRoles && !allowedRoles.some(required => effectiveRoles.includes(required as any) || role === required)) {
      throw new Error(`Permission denied. Required: ${allowedRoles.join(', ')}`);
    }

    return { 
      id: authUser.id, 
      name: authUser.user_metadata?.name || (authUser.email?.split('@')[0] || 'Unknown'), 
      role,
      roles: effectiveRoles
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
  return await transitionOrder(orderId, 'DESIGNING', 'Started Pre-Press Design', user);
}

/**
 * ACTION: Designer sends design to customer for verification
 */
export async function sendForCustomerApproval(orderId: string, designUrl?: string, notes?: string) {
  const user = await getAuthorizedUser(['DESIGNER', 'ADMIN', 'MANAGER']);
  
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) {
    throw new Error(`Order ${orderId} not found.`);
  }

  ensureDesignerOrderAccess(orderData, user);

  // Fetch items from junction table or related items
  const { data: itemsData } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  const orderItems = itemsData || [];
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

  const updatedWorkflow = {
    ...orderData.workflow,
    designUrl: proofUrl,
    designNotes: notes || '',
    sentForApprovalAt: new Date().toISOString(),
    designedBy: user.id,
    designerProofs: [...existingProofs, proofEntry],
    customerDesignFiles: itemDesignFiles,
    customerDesignProvided: customerDesignProvided,
    customerApproval: {
      ...orderData.workflow?.customerApproval,
      status: 'PENDING',
      currentProofVersion: nextVersion,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectionReason: ''
    }
  };

  const meta: any = { 
    workflow: updatedWorkflow,
    notes 
  };

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
  
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) throw new Error('Order not found.');
  
  if (user.role === 'CUSTOMER' && orderData.customerId !== user.id) {
    throw new Error('You are not authorized to approve this design.');
  }

  const updatedWorkflow = {
    ...orderData.workflow,
    designApprovedAt: new Date().toISOString(),
    designApprovedByCustomer: true,
    customerApproval: {
      ...orderData.workflow?.customerApproval,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      approvedBy: user.id,
      rejectionReason: ''
    }
  };

  const result = await transitionOrder(orderId, 'DESIGN_READY', 'Customer Approved Design', user, {
    workflow: updatedWorkflow,
    currentWorkflowRole: 'DESIGNER',
    currentWorkflowLabel: 'Design Approved',
  });

  // Notify the designer
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

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) throw new Error('Order not found.');
  
  if (user.role === 'CUSTOMER' && orderData.customerId !== user.id) {
    throw new Error('You are not authorized to reject this design.');
  }

  const updatedWorkflow = {
    ...orderData.workflow,
    designRejectedAt: new Date().toISOString(),
    latestRejectionNotes: notes,
    customerApproval: {
      ...orderData.workflow?.customerApproval,
      status: 'REJECTED',
      rejectedAt: new Date().toISOString(),
      rejectionReason: notes
    }
  };

  const result = await transitionOrder(orderId, 'DESIGNING', 'Customer Rejected Design — Revision Required', user, {
    workflow: updatedWorkflow,
    notes
  });

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
 * ACTION: Designer workflow completion
 */
export async function finalizePrePress(orderId: string) {
  const user = await getAuthorizedUser(['DESIGNER', 'ADMIN', 'MANAGER']);
  return await transitionOrder(orderId, 'DESIGN_READY', 'Verified Design - Ready for Print', user);
}

/**
 * INTERNAL HELPER: The only function allowed to touch order status in DB
 */
export async function transitionOrder(
  orderId: string,
  nextStatus: OrderStatus,
  actionLabel: string,
  user: { id: string; name: string; role: UserRole },
  metadata: any = {}
) {
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) {
    throw new Error(`Order ${orderId} not found.`);
  }

  const currentStatus = orderData.status as OrderStatus;
  const paymentMethod = orderData.orderType as any;

  // 1. Validate Transition
  const validation = canTransition(currentStatus, nextStatus, paymentMethod === 'CREDIT' ? 'CREDIT' : 'CASH');
  if (!validation.allowed) {
    throw new Error(validation.reason || `Cannot move from ${currentStatus} to ${nextStatus}`);
  }

  if (nextStatus === 'PAYMENT_VERIFIED') {
    throw new Error('PAYMENT_VERIFIED status can only be set through the authorized payment verification action.');
  }

  // 1.5. ACCOUNTANT GATE: Block production pipeline if not yet accountant-approved
  const isAccountantApproved = 
    orderData.status === 'ACCOUNTANT_APPROVED' ||
    ORDER_STATUS_HIERARCHY.indexOf(orderData.status as OrderStatus) > ORDER_STATUS_HIERARCHY.indexOf('ACCOUNTANT_APPROVED');
  const productionStatuses: OrderStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'DISPATCHED'];
  
  if (productionStatuses.includes(nextStatus) && !isAccountantApproved) {
    throw new Error(`Order ${orderId} has not been approved by the Accountant yet. Production is blocked.`);
  }

  // 2. Perform DB Update (Including History Snapshot)
  const historyEntry: StatusHistoryEntry = {
    from: currentStatus,
    to: nextStatus,
    by: user.id,
    timestamp: new Date().toISOString(),
    notes: metadata.notes || '',
    reasonCode: metadata.reasonCode || ''
  };

  const updateData: any = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  // Add history
  const existingHistory = Array.isArray(orderData.workflow?.history) ? orderData.workflow.history : [];
  if (!updateData.workflow) {
    updateData.workflow = orderData.workflow || {};
  }
  updateData.workflow.history = [...existingHistory, historyEntry];

  // Merge other metadata
  Object.keys(metadata).forEach(key => {
    if (key !== 'notes' && metadata[key] !== undefined) {
      if (key === 'workflow') {
        updateData.workflow = { ...updateData.workflow, ...metadata[key] };
      } else {
        updateData[key] = metadata[key];
      }
    }
  });

  // Map Workflow Timestamps
  if (nextStatus === 'ASSIGNED') {
    updateData.workflow = updateData.workflow || {};
    updateData.workflow.assignedAt = new Date().toISOString();
  }
  if (nextStatus === 'IN_PROGRESS') {
    updateData.workflow = updateData.workflow || {};
    updateData.workflow.startedAt = new Date().toISOString();
  }
  if (nextStatus === 'COMPLETED') {
    updateData.workflow = updateData.workflow || {};
    updateData.workflow.completedAt = new Date().toISOString();
  }
  if (nextStatus === 'DISPATCHED') {
    updateData.workflow = updateData.workflow || {};
    updateData.workflow.dispatchedAt = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  if (updateError) throw new Error(`Failed to update order: ${updateError.message}`);

  // ─── PHASE 1: ENTERPRISE MES HISTORY TRACKING ────────────────────────────
  
  try {
    // 1. Close any currently active workflow_stage_history for this parent order
    const { data: activeHistories } = await supabase
      .from('workflow_stage_history')
      .select('id, entered_at')
      .eq('parent_order_id', orderId)
      .is('exited_at', null);

    if (activeHistories && activeHistories.length > 0) {
      const exitedAt = new Date().toISOString();
      for (const h of activeHistories) {
        const enteredAtMs = new Date(h.entered_at).getTime();
        const exitedAtMs = new Date(exitedAt).getTime();
        const durationSeconds = Math.floor((exitedAtMs - enteredAtMs) / 1000);
        const durationMinutes = Math.floor(durationSeconds / 60);
        
        await supabase
          .from('workflow_stage_history')
          .update({ 
            exited_at: exitedAt, 
            duration_seconds: durationSeconds,
            duration_minutes: durationMinutes,
            exited_by: user.id
          })
          .eq('id', h.id);
      }
    }

    // 2. Resolve department ID if department name is provided
    let departmentId = null;
    if (metadata.department_name) {
      const { data: dept } = await supabase
        .from('workflow_departments')
        .select('id, sla_minutes')
        .eq('name', metadata.department_name)
        .single();
      
      if (dept) {
        departmentId = dept.id;
        // 3. Open new stage history record
        await supabase
          .from('workflow_stage_history')
          .insert({
            department_id: departmentId,
            workflow_stage: nextStatus,
            workflow_status: 'OPEN',
            parent_order_id: orderId,
            entered_at: new Date().toISOString(),
            entered_by: user.id,
            assigned_to: metadata.assigned_to || null,
            sla_target_minutes: dept.sla_minutes || 120,
            snapshot: { 
              customerName: orderData.customerName,
              orderType: orderData.orderType,
              grandTotal: orderData.amounts?.grandTotal 
            },
            metadata: metadata.stage_metadata || {}
          });
      }
    }

    // 4. Record event in workflow_events
    await supabase
      .from('workflow_events')
      .insert({
        order_id: orderId,
        department_id: departmentId,
        event_type: `TRANSITION_TO_${nextStatus}`,
        timestamp: new Date().toISOString(),
        user_id: user.id,
        metadata: { action: actionLabel, reasonCode: metadata.reasonCode || '' }
      });
  } catch (mesError: any) {
    console.error('[transitionOrder] MES Tracking failed (non-blocking):', mesError.message);
  }
  // ─────────────────────────────────────────────────────────────────────────

  // 2.5 Incremental Stats Update
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
    await updateStatsIncrementally(null, increments);
  }

  // 3. Log Activity
  await logActivity({
    userId: user.id,
    role: user.role,
    action: actionLabel,
    meta: { orderId, nextStatus }
  });

  // ── Tally Sync: Enqueue SALES_INVOICE on Dispatch ──────────────────────
  if (nextStatus === 'DISPATCHED') {
    (async () => {
      try {
        const { data: freshOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        const { data: items } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);

        if (freshOrder && items) {
          const invoicePayload = await buildSalesInvoicePayload(freshOrder, items);
          await enqueueTallySync({
            syncType: 'SALES_INVOICE',
            orderId,
            customerId: freshOrder.customerId,
            payload: invoicePayload,
            createdBy: user.id,
          });
        }
      } catch (tallyErr: any) {
        console.error('[transitionOrder] Tally enqueue failed (non-blocking):', tallyErr.message);
      }
    })();
  }

  return { success: true, status: nextStatus };
}

/**
 * ACTION: Create New Order
 */
export async function createOrder(
  customerData: { id: string; name: string; type: 'CASH' | 'CREDIT' },
  orderDetails: { 
    grandTotal: number; 
    items: any[]; 
    snapshot: any;
    customerSnapshot?: any;
    deliveryPricingSnapshot?: any;
    deliveryChoice?: string;
    shippingAddress?: string;
    proxyExecutor?: any;
    productionNotes?: string;
    workflowSnapshot?: OrderWorkflowSnapshot;
  }
) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER', 'ACDEMA', 'DESIGNER', 'SUPPORT', 'CUSTOMER']);
  const orderId = `ORD-${Date.now().toString().slice(-6)}`;

  const customerDesignFiles = (orderDetails.items || [])
    .filter((item: any) => {
      const url = (item?.fileUrl || '').trim();
      return url && url !== 'DESIGN_BY_US';
    })
    .map((item: any) => ({
      url: item.fileUrl,
      fileName: extractFileNameFromUrl(item.fileUrl),
      uploadedAt: new Date().toISOString(),
      uploadedBy: customerData.id
    }));

  const customerDesignProvided = customerDesignFiles.length > 0;
  
  try {
    // 1. Fetch customer contact
    const { data: userData, error: userError } = await supabase
      .from('contact')
      .select('*')
      .eq('id', customerData.id)
      .single();

    if (userError || !userData) throw new Error('Customer profile not found.');
    
    if (customerData.type === 'CREDIT') {
      const usedCredit = userData.used_credit || 0;
      const creditLimit = userData.credit_limit || 0;
      if (usedCredit + orderDetails.grandTotal > creditLimit) {
        throw new Error(`Credit limit exceeded. Used: ${usedCredit}, Limit: ${creditLimit}`);
      }
    }

    // 2. Update stats
    await updateStatsIncrementally(null, {
      'orders.total': 1,
      'orders.placed': 1,
      'financial.totalSales': orderDetails.grandTotal,
      'financial.totalOutstanding': orderDetails.grandTotal,
      'financial.totalUnpaid': orderDetails.grandTotal
    });

    // 3. Update contact with used credit
    const profileUpdates: any = {
      updated_at: new Date().toISOString()
    };

    if (customerData.type === 'CREDIT') {
      const newUsedCredit = (userData.used_credit || 0) + orderDetails.grandTotal;
      profileUpdates.used_credit = newUsedCredit;
    }

    await supabase
      .from('contact')
      .update(profileUpdates)
      .eq('id', customerData.id);

    // 4. Create order
    const baseAmount = orderDetails.grandTotal / 1.18;
    const gstAmount = orderDetails.grandTotal - baseAmount;

    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        customerId: customerData.id,
        customerName: customerData.name,
        customerSnapshot: orderDetails.customerSnapshot || {},
        status: 'PLACED',
        paymentStatus: 'PENDING',
        orderType: customerData.type,
        orderSource: user.role === 'CUSTOMER' ? 'WEB' : 'COUNTER',
        createdBy: user.id,
        createdByRole: user.role,
        proxyExecutor: orderDetails.proxyExecutor || null,
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        amounts: {
          base: baseAmount,
          gst: gstAmount,
          grandTotal: orderDetails.grandTotal,
          taxSplit: {
            cgst: gstAmount / 2,
            sgst: gstAmount / 2,
            igst: 0 
          }
        },
        delivery: {
          choice: orderDetails.deliveryChoice || 'PICKUP',
          address: orderDetails.shippingAddress || '',
          pricingSnapshot: orderDetails.deliveryPricingSnapshot || null
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
        workflowSnapshot: orderDetails.workflowSnapshot || null,
        currentWorkflowRole: orderDetails.workflowSnapshot?.steps[orderDetails.workflowSnapshot?.currentStepIndex ?? 0]?.role || null,
        currentWorkflowLabel: orderDetails.workflowSnapshot?.steps[orderDetails.workflowSnapshot?.currentStepIndex ?? 0]?.label || null,
        productionNotes: orderDetails.productionNotes || '',
        thumbnailUrl: orderDetails.items?.[0]?.fileUrl || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (orderError) throw new Error(`Failed to create order: ${orderError.message}`);

    // 5. Insert order items
    for (let index = 0; index < orderDetails.items.length; index++) {
      const item = orderDetails.items[index];
      await supabase
        .from('order_items')
        .insert({
          order_id: orderId,
          productId: item.productId || 'custom',
          productName: item.productName || item.name || 'Custom Item',
          projectName: item.projectName || '',
          specs: item.specs || {
            width: item.width || 0,
            height: item.height || 0,
            quantity: item.quantity || 1,
            sqft: (item.width || 0) * (item.height || 0),
            widthUnit: item.widthUnit || 'FT',
            heightUnit: item.heightUnit || 'FT'
          },
          materialMetadata: item.materialMetadata || {
            materialType: 'custom',
            eyeletType: 'NONE',
            eyeletCount: 0
          },
          pricingSnapshot: item.pricingSnapshot || {
            baseRate: item.rate || 0,
            subTotal: item.subTotal || 0
          },
          fileUrl: item.fileUrl || ''
        });
    }

    // 6. Create transaction
    const txId = `TX-${Date.now()}`;
    const balanceBefore = userData.usedCredit || 0;
    const balanceAfter = balanceBefore + orderDetails.grandTotal;
    const creditLimit = userData.creditLimit || 0;

    await supabase
      .from('transactions')
      .insert({
        id: txId,
        userId: customerData.id,
        type: 'SALE',
        ledgerType: customerData.type,
        refId: orderId,
        debit: orderDetails.grandTotal,
        credit: 0,
        balanceBefore,
        balanceAfter,
        availableCredit: Math.max(0, creditLimit - balanceAfter),
        remarks: `Order Placement: ${orderId}`,
        createdBy: user.id,
        timestamp: new Date().toISOString()
      });

    // 7. Create virtual payment for CREDIT orders
    if (customerData.type === 'CREDIT') {
      const vCreditPaymentId = `V-CREDIT-${Date.now().toString().slice(-6)}`;
      await supabase
        .from('payments')
        .insert({
          id: vCreditPaymentId,
          orderId: orderId,
          userId: customerData.id,
          customerName: customerData.name,
          paymentMode: 'VIRTUAL_CREDIT',
          amount: orderDetails.grandTotal,
          status: 'PENDING',
          depositRefNo: `BAL:${balanceBefore}|${creditLimit}|${balanceAfter}`,
          remarks: `Credit authorization requested for order ${orderId}`,
          created_at: new Date().toISOString()
        });
    }

    // 8. Anomaly Detection
    await detectAnomalies('ORDER', { 
      amount: orderDetails.grandTotal, 
      userId: customerData.id,
      customerType: customerData.type
    }, null);

    if (customerData.type === 'CREDIT') {
      await detectAnomalies('CREDIT', {
        used: userData.usedCredit + orderDetails.grandTotal,
        limit: userData.creditLimit,
        userId: customerData.id
      }, null);
    }

    // 9. Audit log
    if (orderDetails.proxyExecutor || user.role !== 'CUSTOMER') {
      await writeAuditLog({
        actedAs: customerData.id,
        actedAsType: 'CUSTOMER',
        actionType: 'CREATE_ORDER',
        entityType: 'ORDER',
        entityId: orderId,
        meta: { grandTotal: orderDetails.grandTotal }
      });
    }

    return { success: true, orderId };
  } catch (error: any) {
    console.error('Workflow creation error:', error);
    throw new Error(error.message || 'Payment/Credit processing failed.');
  }
}

export async function verifyPayment(orderId: string) {
  const user = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'ACDEMA']);
  
  try {
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !orderData) throw new Error('Order not found');
    
    const customerId = orderData.customerId;

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .eq('orderId', orderId)
      .eq('status', 'PENDING');

    const { data: userData } = await supabase
      .from('contact')
      .select('*')
      .eq('id', customerId)
      .single();

    // Update stats
    let totalToVerify = 0;
    if (paymentsData) {
      totalToVerify = paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0);
    }

    await updateStatsIncrementally(null, {
      'financial.totalReceipts': totalToVerify,
      'financial.totalOutstanding': -totalToVerify,
      'financial.totalPendingVerification': -totalToVerify,
      'payments.approved': 1,
      'payments.pending': -1,
      'orders.paymentPending': -1,
      'orders.verified': 1
    });

    // Update payments
    if (paymentsData && paymentsData.length > 0) {
      await supabase
        .from('payments')
        .update({ 
          status: 'APPROVED', 
          verifiedBy: user.id,
          updated_at: new Date().toISOString() 
        })
        .in('id', paymentsData.map(p => p.id));
    }

    // Update customer credit
    if (userData) {
      const balanceBefore = userData.used_credit || 0;
      const balanceAfter = Math.max(0, balanceBefore - totalToVerify);
      const creditLimit = userData.credit_limit || 0;

      await supabase
        .from('contact')
        .update({
          used_credit: balanceAfter
        })
        .eq('id', customerId);

      // Create transaction
      const txId = `TX-REC-${Date.now()}`;
      await supabase
        .from('transactions')
        .insert({
          id: txId,
          userId: customerId,
          type: 'RECEIPT',
          ledgerType: userData.type,
          refId: orderId,
          debit: 0,
          credit: totalToVerify,
          balanceBefore,
          balanceAfter,
          availableCredit: Math.max(0, creditLimit - balanceAfter),
          remarks: `Payment Verified for ${orderId}`,
          createdBy: user.id,
          timestamp: new Date().toISOString()
        });
    }

    // Update order
    await supabase
      .from('orders')
      .update({
        status: 'PAYMENT_VERIFIED',
        paymentStatus: 'VERIFIED',
        workflow: {
          ...orderData.workflow,
          paymentVerifiedAt: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    // Create notification
    const notificationId = `NOTIF-${Date.now()}`;
    await supabase
      .from('notifications')
      .insert({
        id: notificationId,
        userId: customerId,
        event: 'PAYMENT_VERIFIED',
        message: `Payment for Order ${orderId} has been verified.`,
        meta: { orderId, amount: totalToVerify },
        status: 'UNREAD',
        timestamp: new Date().toISOString()
      });

    // Audit log
    await writeAuditLog({
      actedAs: customerId,
      actedAsType: 'CUSTOMER',
      actionType: 'VERIFY_PAYMENT',
      entityType: 'PAYMENT',
      entityId: orderId,
      meta: { amount: totalToVerify }
    });

    return { success: true, verifiedAmount: totalToVerify };
  } catch (error: any) {
    console.error('Verify Payment Error:', error);
    throw new Error(error.message || 'Failed to verify payment.');
  }
}

export async function assignPrinter(orderId: string, printerId: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER']);
  const { data: printerData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', printerId)
    .single();

  const printerName = printerData?.displayName || printerData?.name || printerId;
  
  const metadata = {
    workflow: {
      assignedTo: printerId,
      assignedToName: printerName,
      assignedBy: user.id,
      assignedByName: user.name,
    }
  };

  try {
    return await advanceOrderWorkflow(orderId, `Assigned to Printer: ${printerId}`, metadata);
  } catch (e: any) {
    if (e.message.includes('dynamic workflow')) {
      return await transitionOrder(orderId, 'ASSIGNED', `Assigned to Printer: ${printerId}`, user, metadata);
    }
    throw e;
  }
}

export async function assignTiffToPrinter(orderId: string, tiffPath: string) {
  const user = await getAuthorizedUser(['ADMIN', 'MANAGER']);
  const normalizedPath = (tiffPath || '').trim();

  if (!isValidTiffPath(normalizedPath)) {
    throw new Error('TIFF path must use a shared network path or file URL and end with .tif or .tiff.');
  }

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) {
    throw new Error(`Order ${orderId} not found.`);
  }

  const sourceDesignPath =
    orderData?.workflow?.designUrl ||
    orderData?.workflow?.customerDesignUrl ||
    orderData?.thumbnailUrl ||
    orderData?.order_items?.[0]?.fileUrl ||
    '';
  const tiffInfo = inspectTiffPath(normalizedPath);

  const printWorkflow = {
    ...(orderData?.printWorkflow || {}),
    status: 'TIFF_READY',
    sourceDesignPath,
    sourceDesignType: sourceDesignPath ? getFileNameFromPath(sourceDesignPath).split('.').pop()?.toLowerCase() || 'unknown' : 'unknown',
    tiffPath: normalizedPath,
    tiffFileName: tiffInfo.fileName,
    convertedBy: user.id,
    convertedAt: new Date().toISOString(),
    sentToPrinter: true,
    sentToPrinterAt: new Date().toISOString(),
    sentToPrinterBy: user.id,
    networkFolder: tiffInfo.networkRoot || null,
    timeline: [
      ...(Array.isArray(orderData?.printWorkflow?.timeline) ? orderData.printWorkflow.timeline : []),
      {
        event: 'TIFF_ASSIGNED',
        timestamp: new Date().toISOString(),
        user: user.id,
        notes: 'Manager assigned TIFF to printer queue',
        tiffPath: normalizedPath,
      },
    ],
  };

  const metadata = {
    workflow: {
      ...orderData.workflow,
      printWorkflow,
      sentToPrinter: true,
      sentToPrinterAt: new Date().toISOString(),
      sentToPrinterBy: user.id,
    }
  };

  try {
    const result = await advanceOrderWorkflow(orderId, 'TIFF prepared and sent to printer queue', metadata);

    await writeAuditLog({
      actedAs: user.id,
      actedAsType: 'ROLE',
      actionType: 'TIFF_ASSIGNED',
      entityType: 'ORDER',
      entityId: orderId,
      meta: {
        tiffPath: normalizedPath,
        sourceDesignPath,
      },
    });

    return result;
  } catch (error: any) {
    if (!String(error?.message || '').toLowerCase().includes('dynamic workflow')) {
      throw error;
    }

    const fallbackUser = { id: user.id, name: user.name, role: user.role };
    const result = await transitionOrder(orderId, 'ASSIGNED', 'TIFF prepared and sent to printer queue', fallbackUser, metadata);

    await writeAuditLog({
      actedAs: user.id,
      actedAsType: 'ROLE',
      actionType: 'TIFF_ASSIGNED',
      entityType: 'ORDER',
      entityId: orderId,
      meta: {
        tiffPath: normalizedPath,
        sourceDesignPath,
      },
    });

    return result;
  }
}

export async function markTiffOpened(orderId: string) {
  const user = await getAuthorizedUser(['PRINTER', 'ADMIN', 'MANAGER']);
  const { data: orderData } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!orderData) {
    throw new Error(`Order ${orderId} not found.`);
  }

  const tiffPath = resolvePrintWorkflow(orderData)?.tiffPath;
  if (!tiffPath) {
    throw new Error('No TIFF path has been assigned for this order.');
  }

  const updateData = {
    workflow: {
      ...orderData.workflow,
      printWorkflow: {
        ...orderData.workflow?.printWorkflow,
        printerOpened: true,
        printerOpenedAt: new Date().toISOString(),
        status: 'TIFF_READY',
        timeline: [
          ...(Array.isArray(orderData?.workflow?.printWorkflow?.timeline) ? orderData.workflow.printWorkflow.timeline : []),
          {
            event: 'TIFF_OPENED',
            timestamp: new Date().toISOString(),
            user: user.id,
            notes: 'Printer opened the shared TIFF file',
            tiffPath,
          },
        ],
      }
    },
    updated_at: new Date().toISOString()
  };

  await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  await writeAuditLog({
    actedAs: user.id,
    actedAsType: 'ROLE',
    actionType: 'TIFF_OPENED',
    entityType: 'ORDER',
    entityId: orderId,
    meta: { tiffPath },
  });

  return { success: true };
}

export async function startTiffPrint(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['PRINTER', 'ADMIN', 'MANAGER']);
  const result = await startJob(orderId, notes || 'Started TIFF print');

  const { data: orderData } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  const tiffPath = orderData ? resolvePrintWorkflow(orderData)?.tiffPath || null : null;

  await writeAuditLog({
    actedAs: user.id,
    actedAsType: 'ROLE',
    actionType: 'TIFF_PRINT_STARTED',
    entityType: 'ORDER',
    entityId: orderId,
    meta: { tiffPath, notes: notes || '' },
  });

  if (orderData) {
    await supabase.from('orders').update({
      workflow: {
        ...orderData.workflow,
        printWorkflow: {
          ...orderData.workflow?.printWorkflow,
          status: 'PRINT_STARTED',
          printerOpened: true,
          printerOpenedAt: new Date().toISOString(),
          printerAcceptedBy: user.id,
          printerAcceptedByName: user.name,
          printerAcceptedAt: new Date().toISOString(),
          timeline: [
            ...(Array.isArray(orderData?.workflow?.printWorkflow?.timeline) ? orderData.workflow.printWorkflow.timeline : []),
            {
              event: 'PRINT_STARTED',
              timestamp: new Date().toISOString(),
              user: user.id,
              notes: notes || 'Print started',
              tiffPath,
            },
          ],
        }
      }
    }).eq('id', orderId);
  }

  return result;
}

export async function completeTiffPrint(orderId: string, notes?: string, materialUsage?: any) {
  const user = await getAuthorizedUser(['PRINTER', 'ADMIN', 'MANAGER']);
  const result = await completeJob(orderId, notes || 'Completed TIFF print', materialUsage);

  const { data: orderData } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  const tiffPath = orderData ? resolvePrintWorkflow(orderData)?.tiffPath || null : null;
  const normalizedMaterialUsage = materialUsage && typeof materialUsage === 'object'
    ? {
        paperUsed: materialUsage.paperUsed || '',
        inkUsed: materialUsage.inkUsed || '',
        wastageNotes: materialUsage.wastageNotes || '',
      }
    : null;

  if (orderData) {
    await supabase.from('orders').update({
      workflow: {
        ...orderData.workflow,
        printWorkflow: {
          ...orderData.workflow?.printWorkflow,
          status: 'PRINT_COMPLETED',
          printerCompleted: true,
          printerCompletedAt: new Date().toISOString(),
          printerCompletedBy: user.id,
          printerCompletedByName: user.name,
          materialUsage: normalizedMaterialUsage,
          timeline: [
            ...(Array.isArray(orderData?.workflow?.printWorkflow?.timeline) ? orderData.workflow.printWorkflow.timeline : []),
            {
              event: 'PRINT_COMPLETED',
              timestamp: new Date().toISOString(),
              user: user.id,
              notes: notes || 'Print completed',
              tiffPath,
            },
          ],
        }
      }
    }).eq('id', orderId);
  }

  await writeAuditLog({
    actedAs: user.id,
    actedAsType: 'ROLE',
    actionType: 'TIFF_PRINT_COMPLETED',
    entityType: 'ORDER',
    entityId: orderId,
    meta: { tiffPath, notes: notes || '', materialUsage: normalizedMaterialUsage },
  });

  return result;
}

/**
 * ACTION: Accountant approves a PLACED order
 */
export async function approveOrderByAccountant(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'ACDEMA']);
  
  return await transitionOrder(orderId, 'ACCOUNTANT_APPROVED', 'Accountant Approved Order', user, {
    workflow: {
      accountantApprovedAt: new Date().toISOString(),
      accountantApprovedBy: user.id,
    },
    notes: notes || ''
  });
}

/**
 * ACTION: Accountant places an order ON_HOLD
 */
export async function putOrderOnHold(orderId: string, reasonCode: RejectionReason, notes: string) {
  const user = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'ACDEMA']);
  
  if (!reasonCode) throw new Error('A hold reason code is required.');
  
  return await transitionOrder(orderId, 'ON_HOLD', 'Order Placed On Hold', user, {
    workflow: {
      holdAt: new Date().toISOString(),
      holdBy: user.id,
    },
    reasonCode,
    notes
  });
}

/**
 * ACTION: Accountant rejects a PLACED or ON_HOLD order
 */
export async function rejectOrderByAccountant(orderId: string, reasonCode: RejectionReason, notes: string) {
  const user = await getAuthorizedUser(['ADMIN', 'ACCOUNTANT', 'ACDEMA']);
  
  if (!reasonCode) throw new Error('Rejection reason code is required for audit compliance.');
  
  return await transitionOrder(orderId, 'REJECTED', 'Accountant Rejected Order', user, {
    workflow: {
      rejectedAt: new Date().toISOString(),
      rejectedBy: user.id,
      rejectionReason: reasonCode,
    },
    reasonCode,
    notes
  });
}

export async function startJob(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['PRINTER', 'ADMIN', 'MANAGER']);
  
  try {
    return await startWorkflowStep(orderId, notes);
  } catch (e: any) {
    if (e.message.includes('No dynamic workflow')) {
      return await transitionOrder(orderId, 'IN_PROGRESS', 'Started Production', user, {
        workflow: {
          startedAt: new Date().toISOString()
        },
        notes
      });
    }
    throw e;
  }
}

export async function pauseJob(orderId: string, notes: string) {
  const user = await getAuthorizedUser(['PRINTER', 'ADMIN', 'MANAGER']);
  if (!notes) throw new Error('Notes required to pause production.');

  try {
    return await pauseWorkflowStep(orderId, notes);
  } catch (e: any) {
    if (e.message.includes('No dynamic workflow')) {
      return await transitionOrder(orderId, 'PRODUCTION_PAUSED', 'Paused Production', user, {
        notes
      });
    }
    throw e;
  }
}

export async function resumeJob(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['PRINTER', 'ADMIN', 'MANAGER']);
  
  try {
    return await resumeWorkflowStep(orderId, notes);
  } catch (e: any) {
    if (e.message.includes('No dynamic workflow')) {
      return await transitionOrder(orderId, 'IN_PROGRESS', 'Resumed Production', user, {
        workflow: {
          resumedAt: new Date().toISOString()
        },
        notes
      });
    }
    throw e;
  }
}

export async function completeJob(orderId: string, notes?: string, materialUsage?: any) {
  const user = await getAuthorizedUser(['PRINTER', 'ADMIN', 'MANAGER']);
  
  try {
    return await advanceOrderWorkflow(orderId, notes, materialUsage);
  } catch (e: any) {
    if (e.message.includes('No dynamic workflow')) {
      const updateMeta: any = {
        workflow: {
          completedAt: new Date().toISOString()
        },
        notes
      };
      if (materialUsage) {
        updateMeta.materialUsage = materialUsage;
      }
      return await transitionOrder(orderId, 'COMPLETED', 'Completed Production', user, updateMeta);
    }
    throw e;
  }
}

/**
 * ACTION: Dispatch Order
 */
export async function dispatchOrder(
  orderId: string, 
  dispatchDetails: {
    method: 'PICKUP' | 'TRANSPORT' | 'COURIER' | 'DOOR_DELIVERY';
    transportName?: string;
    lrNumber?: string;
    notes?: string;
  }
) {
  const user = await getAuthorizedUser(['DISPATCH', 'ADMIN', 'MANAGER']);
  
  const dispatchRecord = {
    orderId,
    ...dispatchDetails,
    dispatchedBy: user.id,
    dispatchedByName: (user as any).displayName || user.name,
    timestamp: new Date().toISOString()
  };

  const { data: orderData } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  const alreadyDispatched = orderData?.status === 'DISPATCHED';
  const usesDynamicWorkflow = Boolean(orderData?.workflowSnapshot && orderData?.currentWorkflowRole === 'DISPATCH');

  await supabase
    .from('dispatches')
    .upsert(dispatchRecord, { onConflict: 'orderId' });

  let transitionResult;
  if (usesDynamicWorkflow) {
    transitionResult = await advanceOrderWorkflow(orderId, dispatchDetails.notes, {
      dispatchInfo: dispatchDetails,
      workflow: {
        dispatchedAt: new Date().toISOString()
      }
    });
  } else if (alreadyDispatched) {
    await supabase
      .from('orders')
      .update({
        dispatchInfo: dispatchDetails,
        workflow: {
          ...orderData?.workflow,
          dispatchedAt: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);
    transitionResult = { success: true, nextStage: 'DISPATCHED' };
  } else {
    transitionResult = await transitionOrder(orderId, 'DISPATCHED', `Dispatched via ${dispatchDetails.method}`, user, {
      dispatchInfo: dispatchDetails,
      workflow: {
        dispatchedAt: new Date().toISOString()
      }
    });
  }

  const customerId = orderData?.customerId || 'UNKNOWN';

  await writeAuditLog({
    actedAs: customerId,
    actedAsType: 'CUSTOMER',
    actionType: 'DISPATCH_ORDER',
    entityType: 'ORDER',
    entityId: orderId,
    meta: { method: dispatchDetails.method }
  });

  return transitionResult;
}

/**
 * ACTION: Mark In Transit
 */
export async function markInTransit(orderId: string, notes?: string) {
  const user = await getAuthorizedUser(['DISPATCH', 'ADMIN', 'MANAGER']);
  return await transitionOrder(orderId, 'IN_TRANSIT', 'Order is In Transit', user, {
    workflow: {
      inTransitAt: new Date().toISOString()
    },
    notes
  });
}

/**
 * ACTION: Deliver Order (Staff)
 */
export async function deliverOrder(orderId: string, notes?: string, proofUrl?: string) {
  const user = await getAuthorizedUser(['DISPATCH', 'DELIVERY', 'ADMIN', 'MANAGER']);

  const updateMeta: any = {
    workflow: {
      deliveredAt: new Date().toISOString()
    },
    notes
  };

  if (proofUrl) {
    updateMeta.workflow.deliveryProof = {
      url: proofUrl,
      uploadedBy: user.id,
      uploadedByName: (user as any).displayName || user.name,
      uploadedAt: new Date().toISOString()
    };
  }

  return await transitionOrder(orderId, 'DELIVERED', 'Order Delivered', user, updateMeta);
}

/**
 * ACTION: Customer confirms delivery
 */
export async function confirmDelivery(orderId: string) {
  const user = await getAuthorizedUser(['CUSTOMER', 'ADMIN', 'MANAGER']);

  const { data: orderData } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!orderData) throw new Error('Order not found.');

  if (user.role === 'CUSTOMER' && orderData.customerId !== user.id) {
    throw new Error('You are not authorized to confirm this order.');
  }

  if (orderData.status !== 'DISPATCHED') {
    throw new Error('Order must be in DISPATCHED status to confirm delivery.');
  }

  return await transitionOrder(orderId, 'DELIVERED', 'Customer Confirmed Delivery', user, {
    workflow: {
      ...orderData.workflow,
      deliveredAt: new Date().toISOString(),
      deliveryConfirmedByCustomer: true,
      deliveryConfirmedAt: new Date().toISOString(),
    }
  });
}

/**
 * HELPER: Notify User
 */
export async function sendNotification(userId: string, event: string, message: string, meta?: any) {
  const notificationId = `NOTIF-${Date.now()}`;
  
  // In-App Notification
  await supabase
    .from('notifications')
    .insert({
      id: notificationId,
      userId,
      event,
      message,
      meta: meta || {},
      status: 'UNREAD',
      timestamp: new Date().toISOString()
    });

  // Log external communication — try contact first (customers), fall back to profiles (staff)
  const { data: userData } = await supabase
    .from('contact')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (userData?.email) {
    console.log(`[STITCH-COMM] Emailing ${userData.email}: ${message}`);
  }
  if (userData?.phone) {
    console.log(`[STITCH-COMM] SMS to ${userData.phone}: ${message}`);
  }
}

/**
 * ACTION: Advance order to the next workflow step
 */
export async function advanceOrderWorkflow(
  orderId: string,
  notes?: string,
  metadata: any = {}
) {
  const user = await getAuthorizedUser();

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) throw new Error('Order not found');

  const snapshot = orderData.workflowSnapshot as OrderWorkflowSnapshot;
  
  if (!snapshot || !snapshot.steps) {
    throw new Error('This order does not follow a dynamic workflow.');
  }

  const currentIdx = snapshot.currentStepIndex;
  if (currentIdx >= snapshot.steps.length) {
    throw new Error('Workflow already completed.');
  }

  const currentStep = snapshot.steps[currentIdx];

  // Security: Role check
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'MANAGER') {
    const hasAssignedRole = Array.isArray((user as any).roles)
      ? (user as any).roles.includes(currentStep.role)
      : false;

    if (user.role !== currentStep.role && !hasAssignedRole) {
      throw new Error(`Permission denied. Current stage requires ${currentStep.role} role.`);
    }
  }

  // 1. Complete current step
  snapshot.steps[currentIdx] = {
    ...currentStep,
    status: 'COMPLETED',
    completedAt: new Date().toISOString(),
    completedBy: user.id,
    notes: notes || ''
  };

  // 2. Unlock next step
  const nextIdx = currentIdx + 1;
  const isFinished = nextIdx >= snapshot.steps.length;
  const nextStep = isFinished ? null : snapshot.steps[nextIdx];

  const updateData: any = {
    workflowSnapshot: snapshot,
    updated_at: new Date().toISOString(),
  };

  if (!isFinished && nextStep) {
    nextStep.status = 'PENDING';
    snapshot.currentStepIndex = nextIdx;
    updateData.currentWorkflowRole = nextStep.role;
    updateData.currentWorkflowLabel = nextStep.label;
    if (nextStep.role === 'PRINTER') {
      updateData.status = 'ASSIGNED';
    }
  } else {
    updateData.currentWorkflowRole = null;
    updateData.currentWorkflowLabel = 'COMPLETED';
  }

  Object.assign(updateData, metadata);

  // Compatibility: Map to legacy status
  if (currentStep.role === 'ACCOUNTANT') {
    updateData.status = 'ACCOUNTANT_APPROVED';
  } else if (currentStep.role === 'PRINTER') {
    updateData.status = 'COMPLETED';
  } else if (currentStep.role === 'DISPATCH') {
    updateData.status = 'DISPATCHED';
  } else if (currentStep.role === 'DESIGNER' && !isFinished) {
    updateData.status = 'ASSIGNED';
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  if (updateError) throw new Error(`Failed to advance workflow: ${updateError.message}`);

  // Audit log
  await writeAuditLog({
    actedAs: user.id,
    actedAsType: 'ROLE',
    actionType: 'WORKFLOW_ADVANCE',
    entityType: 'ORDER',
    entityId: orderId,
    meta: { 
      stage: currentStep.label, 
      role: currentStep.role,
      nextStage: isFinished ? 'DONE' : nextStep?.label 
    }
  });

  // Automated Notifications
  if (!isFinished && nextStep?.role === 'DISPATCH') {
    await sendNotification(
      orderData.customerId,
      'PRODUCTION_COMPLETED',
      `Order #${orderId.slice(-6).toUpperCase()} is ready for dispatch!`,
      { orderId }
    );
  }

  return { success: true, isFinished, nextStage: isFinished ? null : nextStep?.label };
}

/**
 * ACTION: Start workflow step
 */
export async function startWorkflowStep(orderId: string, notes?: string) {
  const user = await getAuthorizedUser();

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) throw new Error('Order not found');

  const snapshot = orderData.workflowSnapshot as OrderWorkflowSnapshot;
  
  if (!snapshot) throw new Error('No dynamic workflow assigned.');

  const currentIdx = snapshot.currentStepIndex;
  const currentStep = snapshot.steps[currentIdx];

  if (!['PENDING', 'ON_HOLD', 'PAUSED', 'IN_PROGRESS'].includes(currentStep.status)) {
    throw new Error(`Cannot start step in ${currentStep.status} state.`);
  }

  let isAlreadyStarted = currentStep.status === 'IN_PROGRESS';
  
  if (!isAlreadyStarted) {
    snapshot.steps[currentIdx].status = 'IN_PROGRESS';
  }
  
  const updateData: any = {
    workflowSnapshot: snapshot,
    updated_at: new Date().toISOString()
  };

  if (currentStep.role === 'PRINTER') {
    updateData.status = 'IN_PROGRESS';
  }
  if (currentStep.role === 'DESIGNER') {
    updateData.status = 'DESIGNING';
    updateData.workflow = updateData.workflow || {};
    updateData.workflow.designedBy = user.id;
    updateData.workflow.designedByName = user.name;
  }

  await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  await logActivity({
    userId: user.id,
    role: user.role,
    action: `Started step ${snapshot.steps[currentIdx].label} for order ${orderId}`,
    meta: { orderId, notes }
  });

  return {
    success: true,
    orderId,
    snapshot: snapshot
  };
}

/**
 * ACTION: Pause workflow step
 */
export async function pauseWorkflowStep(orderId: string, notes: string) {
  const user = await getAuthorizedUser();

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) throw new Error('Order not found');

  const snapshot = orderData.workflowSnapshot as OrderWorkflowSnapshot;
  if (!snapshot) throw new Error('No dynamic workflow assigned.');

  const currentIdx = snapshot.currentStepIndex;
  const currentStep = snapshot.steps[currentIdx];

  if (currentStep.status !== 'IN_PROGRESS') {
    throw new Error(`Cannot pause step in ${currentStep.status} state.`);
  }

  snapshot.steps[currentIdx].status = 'PAUSED';
  snapshot.steps[currentIdx].notes = notes;

  const updateData: any = {
    workflowSnapshot: snapshot,
    updated_at: new Date().toISOString()
  };

  if (currentStep.role === 'PRINTER') {
    updateData.status = 'PRODUCTION_PAUSED';
  }

  await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  await logActivity({
    userId: user.id,
    role: user.role,
    action: `Paused step for order ${orderId}`,
    meta: { orderId, notes }
  });

  return {
    success: true,
    orderId,
    snapshot: snapshot
  };
}

/**
 * ACTION: Resume workflow step
 */
export async function resumeWorkflowStep(orderId: string, notes?: string) {
  const user = await getAuthorizedUser();

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderError || !orderData) throw new Error('Order not found');

  const snapshot = orderData.workflowSnapshot as OrderWorkflowSnapshot;
  if (!snapshot) throw new Error('No dynamic workflow assigned.');

  const currentIdx = snapshot.currentStepIndex;
  const currentStep = snapshot.steps[currentIdx];

  if (currentStep.status !== 'PAUSED' && currentStep.status !== 'ON_HOLD') {
    throw new Error(`Cannot resume step from ${currentStep.status} state.`);
  }

  snapshot.steps[currentIdx].status = 'IN_PROGRESS';
  if (notes) snapshot.steps[currentIdx].notes = notes;

  const updateData: any = {
    workflowSnapshot: snapshot,
    updated_at: new Date().toISOString()
  };

  if (currentStep.role === 'PRINTER') {
    updateData.status = 'IN_PROGRESS';
  }

  await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  await logActivity({
    userId: user.id,
    role: user.role,
    action: `Resumed step for order ${orderId}`,
    meta: { orderId, notes }
  });

  return {
    success: true,
    orderId,
    snapshot: snapshot
  };
}

// Helper to serialize timestamps (Supabase doesn't use Timestamp objects)
function serializeTimestamp(obj: any): any {
  if (!obj) return obj;
  if (typeof obj.toISOString === 'function') {
    return obj.toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeTimestamp);
  }
  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const key in obj) {
      serialized[key] = serializeTimestamp(obj[key]);
    }
    return serialized;
  }
  return obj;
}
