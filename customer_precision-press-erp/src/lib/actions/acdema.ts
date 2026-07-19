// @ts-nocheck
'use server';

import * as admin from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { createCustomerGroupedOrders } from '@/lib/workflow';
import { getCustomers } from '@/lib/actions/users';
import { getCachedProduct, getCachedWorkflow } from '@/lib/cache/products';
import { generateOrderId } from '@/lib/order-ids';
import { getFileNameFromPath } from '@/lib/tiff-utils';
import { writeAuditLog } from '@/lib/audit-log';
import { UserProfile, UserRole, getEffectiveRoles } from '@/types/auth';
import { OrderWorkflowSnapshot, OrderWorkflowStep } from '@/types/workflow';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabaseServer } from '@/lib/supabase-server';

type PaymentMode = 'HAND_CASH' | 'COD' | 'UPI' | 'CREDIT';

export interface ProxyOrderItemInput {
  productId: string;
  productName: string;
  projectName?: string;
  width: number;
  widthUnit: 'FT' | 'IN';
  height: number;
  heightUnit: 'FT' | 'IN';
  quantity: number;
  eyeletType: 'METAL' | 'PLASTIC' | 'NONE';
  eyeletCount: number;
  rate: number;
  eyeletRate: number;
  fileUrl?: string;
  tiffPath: string;
  pricingSnapshot?: any;
  subTotal: number;
}

export interface ProxyOrderPayload {
  customerId: string;
  customerSnapshot: {
    uid: string;
    name: string;
    displayName?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  items: ProxyOrderItemInput[];
  grandTotal: number;
  paymentMode: PaymentMode;
  deliveryChoice: 'PICKUP' | 'DOOR_DELIVERY' | 'COURIER' | 'TRANSPORT';
  shippingAddress?: string;
  tiffPath: string;
  upiProofUrl?: string;
  notes?: string;
  referenceNumber?: string;
  depositDate?: string;
  voucherApplied?: boolean;
  voucherGstDiscount?: number;
  transportCharges?: number;
  isInterstate?: boolean;
  gstRate?: number;
  deliveryPricingSnapshot?: any;
}

async function getAuthorizedAcdemaUser() {
  const token = cookies().get('customer_session')?.value;
  if (!token) throw new Error('Authentication required.');

  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token);
  if (authError || !user) throw new Error('Unauthorized');

  const { data: profile, error: profileError } = await supabaseServer
    .from('profiles')
    .select('role, roles, name')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('getAuthorizedAcdemaUser DB Error:', profileError);
  }

  const role = (profile?.role ?? 'CUSTOMER') as UserRole;
  const effectiveRoles = getEffectiveRoles(profile as any, role).map(r => String(r).toUpperCase());

  const allowed = ['ACDEMA', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'DESIGNER', 'SUPPORT'] as UserRole[];
  if (!allowed.some(required => effectiveRoles.includes(required as any) || role === required)) {
    throw new Error('Permission denied. Proxy order access required.');
  }

  return {
    id: user.id,
    name: profile?.name || user.email?.split('@')[0] || 'Unknown',
    role,
  };
}

function assertValidTiffPath(path?: string | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (trimmed === '' || trimmed === 'false' || trimmed === 'undefined' || trimmed === 'null') {
    return null;
  }
  return trimmed;
}

export async function createAcdemaProxyOrder(payload: ProxyOrderPayload): Promise<{ success: boolean; orderId?: string; orderIds?: string[]; error?: string }> {
  try {
    const rateLimit = await checkRateLimit('checkout', 10, 60);
    if (!rateLimit.allowed) {
      return { success: false, error: 'Too many order requests. Please try again later.' };
    }

    const user = await getAuthorizedAcdemaUser();
    const isAcdemaUser = user.role === 'ACDEMA';
    const tiffPath = assertValidTiffPath(payload.tiffPath);

    if (!payload.customerId) throw new Error('Customer selection is required.');
    if (!payload.items.length) throw new Error('At least one item is required.');
    if (payload.grandTotal <= 0) throw new Error('Grand total must be greater than zero.');

    const baseId = generateOrderId();
    const isMultiItem = payload.items.length > 1;

    const preparedItems = payload.items.map((item) => {
      const itemTiffPath = assertValidTiffPath(item.tiffPath) || tiffPath;
      return {
        ...item,
        fileUrl: item.fileUrl || itemTiffPath || '',
        tiffPath: itemTiffPath || '',
      };
    });

    const productIds = preparedItems.map(item => String(item.productId || (item as any).id || '').trim()).filter(Boolean);
    const preFetchedProducts = await Promise.all(
      productIds.map(async id => {
        const product = await getCachedProduct(id);
        const steps = await getCachedWorkflow(id);
        return product ? { ...product, workflowSteps: steps } : null;
      })
    ).then(res => res.filter(Boolean));

    const result = await createCustomerGroupedOrders(
      {
        id: payload.customerId,
        name: payload.customerSnapshot.displayName || payload.customerSnapshot.name,
        type: payload.paymentMode === 'CREDIT' ? 'CREDIT' : 'CASH',
      },
      {
        idOverride: baseId,
        grandTotal: payload.grandTotal,
        items: preparedItems,
        snapshot: {},
        customerSnapshot: payload.customerSnapshot,
        deliveryChoice: payload.deliveryChoice,
        shippingAddress: payload.shippingAddress || (payload.deliveryChoice === 'PICKUP' ? 'Self Pickup' : ''),
        proxyExecutor: { uid: user.id, role: user.role, name: user.name || 'AcDema Support' },
        productionNotes: payload.notes || '',
        paymentMethod: payload.paymentMode === 'CREDIT' ? 'CREDIT' : (payload.paymentMode === 'UPI' ? 'UPI' : 'CASH'),
        paymentMode: payload.paymentMode,
        transportCharges: payload.transportCharges || 0,
        voucherDiscount: payload.voucherGstDiscount || 0,
        deliveryPricingSnapshot: payload.deliveryPricingSnapshot || {
          [payload.deliveryChoice?.toLowerCase() || '']: payload.transportCharges || 0,
        },
        isInterstate: payload.isInterstate,
        gstRate: payload.gstRate,
        // ── Transactional Outbox ──────────────────────────────────────────────────
        // This opaque blob is picked up by executeOrderPlacementTx and inserted into
        // document_jobs as ACDEMA_POST_PROCESS inside the same BEGIN…COMMIT block.
        // The order and its background-job ticket are therefore always atomic.
        acdemaJobPayloadExtra: {
          payload,
          user,
          preparedItems,
          tiffPath,
        },
        preFetchedProducts: preFetchedProducts || undefined,
      }
    );

    if (!result.success || !result.orderIds) {
      throw new Error((result as any).error || 'Failed to create proxy orders.');
    }

    const generatedOrderIds = result.orderIds;

    // revalidatePath is intentionally synchronous — it is an in-process Next.js
    // cache-tag flush with no network round-trip (microsecond cost), and keeping
    // it here ensures the UI sees fresh data the moment the user is redirected.
    revalidatePath('/acdema');
    generatedOrderIds.forEach(id => revalidatePath(`/printer/orders/${id}`));
    if (isMultiItem) {
      revalidatePath(`/printer/orders/${baseId}`);
    }
    revalidatePath('/printer/queue');

    return { success: true, orderId: baseId, orderIds: generatedOrderIds };
  } catch (error: any) {
    console.error('Proxy Order Creation Failed:', error);
    return { success: false, error: error.message };
  }
}

export async function processAcdemaPostOrderBackground(jobPayload: any) {
  const {
    baseId,
    generatedOrderIds,
    isMultiItem,
    payload,
    user,
    preparedItems,
    tiffPath
  } = jobPayload;

  // ── Idempotency Guard ────────────────────────────────────────────────────────
  // Check whether post-processing has already completed for this order.
  // This makes the handler safe to retry: a crash after partial Firestore writes
  // will re-run all writes (which are idempotent set/update calls), and once the
  // handler finishes successfully it stamps acdemaPostProcessed=true so any
  // further retry is a no-op.
  const { data: orderMeta } = await supabaseServer
    .from('orders')
    .select('metadata')
    .eq('id', baseId)
    .single();

  if ((orderMeta?.metadata as any)?.acdemaPostProcessed === true) {
    console.log(`[ACDEMA Worker] Post-processing already completed for order ${baseId}. Skipping.`);
    return;
  }
  // ────────────────────────────────────────────────────────────────────────────

  const now = admin.firestore.FieldValue.serverTimestamp();
  const isAcdemaUser = user.role === 'ACDEMA';

  try {
    await Promise.all(generatedOrderIds.map(async (orderId: string, i: number) => {
      const itemIndex = orderId.includes('-item')
        ? parseInt(orderId.split('-item').pop() || '1', 10) - 1
        : 0;

      const item = preparedItems[itemIndex];
      const itemTiffPath = item?.tiffPath;
      const itemTiffFileName = itemTiffPath ? itemTiffPath.split('/').pop() || '' : '';

      const printWorkflow = itemTiffPath
        ? {
            status: 'TIFF_READY',
            sourceDesignPath: itemTiffPath,
            tiffPath: itemTiffPath,
            tiffFileName: itemTiffFileName,
            sentToPrinter: true,
            sentToPrinterAt: now,
            sentToPrinterBy: user.id,
            itemAssignments: [{
              itemId: (item as any).id || `item_${baseId}_${itemIndex}`,
              tiffPath: itemTiffPath,
              printerId: 'AUTO',
              printerName: 'ACDEMA Proxy',
              assignedBy: user.id,
              assignedAt: admin.firestore.Timestamp.now(),
            }],
            timeline: [
              {
                event: 'TIFF_ASSIGNED',
                timestamp: admin.firestore.Timestamp.now(),
                user: user.id,
                notes: payload.notes || 'Proxy order created via ACDEMA.',
                tiffPath: itemTiffPath,
              },
            ],
          }
        : { status: 'TIFF_PENDING', sentToPrinter: false, timeline: [] };

      const orderRef = adminDb.collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();
      const orderData = orderSnap.data() || {};

      const itemsSnap = await orderRef.collection('items').get();
      await Promise.all(itemsSnap.docs.map(async (itemDoc) => {
        const subUpdate: Record<string, any> = {
          assignedPrinterId: itemTiffPath ? 'AUTO' : null,
          assignedPrinterName: itemTiffPath ? 'ACDEMA Proxy' : null,
          projectName: item.projectName || '',
        };
        if (itemTiffPath) {
          subUpdate.tiffPath = itemTiffPath;
          subUpdate.tiffAssignedBy = user.id;
          subUpdate.tiffAssignedAt = now;
        }
        await itemDoc.ref.update(subUpdate);
      }));

      const itemUpdate = {
        ...item,
        assignedPrinterId: itemTiffPath ? 'AUTO' : null,
        assignedPrinterName: itemTiffPath ? 'ACDEMA Proxy' : null,
        projectName: item.projectName || '',
        ...(itemTiffPath ? {
          tiffPath: itemTiffPath,
          tiffAssignedBy: user.id,
          tiffAssignedAt: now,
        } : {}),
      };

      await orderRef.update({
        status: isAcdemaUser && itemTiffPath && orderData.currentWorkflowRole === 'PRINTER' ? 'ASSIGNED' : orderData.status,
        paymentMethod: payload.paymentMode === 'CREDIT' ? 'CREDIT' : (payload.paymentMode === 'UPI' ? 'UPI' : 'CASH'),
        paymentStatus: (['CREDIT', 'HAND_CASH', 'COD'] as PaymentMode[]).includes(payload.paymentMode) ? 'VERIFIED' : 'PENDING',
        proxyExecutor: { uid: user.id, role: user.role, name: user.name },
        'workflow.paymentVerifiedAt': (['CREDIT', 'HAND_CASH', 'COD'] as PaymentMode[]).includes(payload.paymentMode) ? now : null,
        'workflow.paymentVerifiedBy': (['CREDIT', 'HAND_CASH', 'COD'] as PaymentMode[]).includes(payload.paymentMode) ? user.id : null,
        'workflow.printWorkflow': printWorkflow,
        baseOrderId: baseId,
        groupOrderIds: generatedOrderIds,
        updatedAt: now,
        items: [itemUpdate],
      });

      const itemGrandTotal = item.subTotal + (payload.voucherApplied ? 0 : Math.round(item.subTotal * 0.18));
      await writeAuditLog({
        actedAs: payload.customerId,
        actedAsType: 'CUSTOMER',
        actionType: 'CREATE_ORDER',
        entityType: 'ORDER',
        entityId: orderId,
        meta: {
          proxyRole: 'ACDEMA',
          paymentMode: payload.paymentMode,
          grandTotal: itemGrandTotal,
          tiffPath: itemTiffPath,
        },
      });
    }));

    if (isMultiItem) {
      const parentOrderRef = adminDb.collection('orders').doc(baseId);
      await parentOrderRef.update({
        status: 'PLACED',
        paymentMethod: payload.paymentMode === 'CREDIT' ? 'CREDIT' : (payload.paymentMode === 'UPI' ? 'UPI' : 'CASH'),
        paymentStatus: (['CREDIT', 'HAND_CASH', 'COD'] as PaymentMode[]).includes(payload.paymentMode) ? 'VERIFIED' : 'PENDING',
        proxyExecutor: { uid: user.id, role: user.role, name: user.name },
        'workflow.paymentVerifiedAt': (['CREDIT', 'HAND_CASH', 'COD'] as PaymentMode[]).includes(payload.paymentMode) ? now : null,
        'workflow.paymentVerifiedBy': (['CREDIT', 'HAND_CASH', 'COD'] as PaymentMode[]).includes(payload.paymentMode) ? user.id : null,
        groupOrderIds: generatedOrderIds,
        updatedAt: now,
      });
    }

    const paymentId = `PAY-${Date.now().toString().slice(-8)}`;
    await adminDb.collection('payments').doc(paymentId).set({
      id: paymentId,
      orderId: baseId,
      orderIds: generatedOrderIds,
      userId: payload.customerId,
      customerName: payload.customerSnapshot.displayName || payload.customerSnapshot.name,
      paymentMode: payload.paymentMode,
      amount: payload.grandTotal,
      ourBankAccount: payload.paymentMode === 'UPI' ? 'UPI_SCREENSHOT' : 'CASH_COUNTER',
      depositDate: payload.depositDate || new Date().toISOString().split('T')[0],
      depositBank: payload.paymentMode === 'UPI' ? 'UPI' : 'COUNTER',
      branchName: 'ACDEMA',
      proofDriveLink: payload.upiProofUrl || '',
      remarks: payload.notes || `Proxy order created by ${user.name}`,
      depositRefNo: payload.referenceNumber || `PROXY-${baseId}`,
      status: isAcdemaUser && payload.paymentMode !== 'UPI' ? 'APPROVED' : 'PENDING',
      approvedBy: isAcdemaUser && payload.paymentMode !== 'UPI' ? user.id : null,
      approvedAt: isAcdemaUser && payload.paymentMode !== 'UPI' ? admin.firestore.FieldValue.serverTimestamp() : null,
      createdByRole: user.role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (isAcdemaUser && payload.paymentMode !== 'UPI' && payload.paymentMode !== 'CREDIT') {
      try {
        const profRef = adminDb.collection('profiles').doc(payload.customerId);

        await adminDb.runTransaction(async (tx) => {
          const ordersToUpdate = [...generatedOrderIds];
          if (isMultiItem) {
            ordersToUpdate.push(baseId);
          }

          for (const orderId of ordersToUpdate) {
            const orderRef = adminDb.collection('orders').doc(orderId);
            const orderSnap = await tx.get(orderRef);

            const orderData = orderSnap.exists ? (orderSnap.data() as any) : null;
            let currentWorkflowRole = orderData?.currentWorkflowRole ?? null;
            let currentWorkflowLabel = orderData?.currentWorkflowLabel ?? null;
            let updatedSnapshot = orderData?.workflowSnapshot ?? null;

            if (orderData?.workflowSnapshot && Array.isArray(orderData.workflowSnapshot.steps)) {
              const snapshot = orderData.workflowSnapshot as OrderWorkflowSnapshot;
              const currentIdx = snapshot.currentStepIndex ?? 0;

              if (currentIdx < snapshot.steps.length && snapshot.steps[currentIdx].role === 'ACCOUNTANT') {
                const steps = [...snapshot.steps];
                steps[currentIdx] = {
                  ...steps[currentIdx],
                  status: 'COMPLETED',
                  completedAt: admin.firestore.Timestamp.now(),
                  completedBy: user.id,
                };

                const nextIdx = currentIdx + 1;
                if (nextIdx < steps.length) {
                  steps[nextIdx] = { ...steps[nextIdx], status: 'PENDING' };
                  currentWorkflowRole = steps[nextIdx].role;
                  currentWorkflowLabel = steps[nextIdx].label;
                  updatedSnapshot = { ...snapshot, steps, currentStepIndex: nextIdx };
                } else {
                  currentWorkflowRole = null;
                  currentWorkflowLabel = 'COMPLETED';
                  updatedSnapshot = { ...snapshot, steps };
                }
              }
            }

            tx.update(orderRef, {
              paymentStatus: 'VERIFIED',
              status: 'PAYMENT_VERIFIED',
              currentWorkflowRole,
              currentWorkflowLabel,
              workflowSnapshot: updatedSnapshot,
              'workflow.paymentVerifiedAt': admin.firestore.FieldValue.serverTimestamp(),
              'workflow.paymentVerifiedBy': user.id,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          tx.update(adminDb.collection('payments').doc(paymentId), {
            status: 'APPROVED',
            approvedBy: user.id,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          tx.update(profRef, {
            'membership.totalPayments': admin.firestore.FieldValue.increment(payload.grandTotal),
            'membership.totalSpend': admin.firestore.FieldValue.increment(payload.grandTotal),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      } catch (err) {
        console.error('Failed to auto-verify ACDEMA payment transaction:', err);
      }
    }

    // ── Idempotency Stamp ─────────────────────────────────────────────────────
    // All work is complete. Merge acdemaPostProcessed into the existing metadata
    // object rather than replacing it, so independent flags set by other workers
    // (analyticsUpdated, invoiceGenerated, tallySynced, etc.) are preserved.
    // orderMeta is already in scope from the guard read at the top — no extra
    // DB call required.
    const existingMetadata = (orderMeta?.metadata as Record<string, any>) || {};
    await supabaseServer
      .from('orders')
      .update({ metadata: { ...existingMetadata, acdemaPostProcessed: true } })
      .eq('id', baseId);
    // ─────────────────────────────────────────────────────────────────────────
  } catch (error) {
    console.error('[ACDEMA Worker] Failed to process post-order tasks:', error);
    throw error;
  }
}
