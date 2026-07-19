// @ts-nocheck
'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import * as admin from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { enqueueTallySync, buildReceiptVoucherPayload } from '@/lib/actions/tally-sync';
import { checkRateLimit } from '@/lib/rate-limit';


// ─── Auth helper ───────────────────────────────────────────────────────────────
async function getAuthUser() {
  const token = cookies().get('customer_session')?.value;
  if (!token) throw new Error('Not authenticated.');
  const decoded = await adminAuth.verifyIdToken(token);
  const primaryRole = decoded.role as string;
  const roles = Array.isArray(decoded.roles) ? decoded.roles : [];

  const allRoles = new Set<string>();
  if (primaryRole) allRoles.add(primaryRole);
  roles.forEach(r => allRoles.add(r));

  if (allRoles.has('ACDEMA')) {
    allRoles.add('ACCOUNTANT');
    allRoles.add('DESIGNER');
    allRoles.add('MANAGER');
  }

  return {
    uid: decoded.uid,
    role: primaryRole,
    roles: Array.from(allRoles),
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface ItemBreakdown {
  orderId: string;
  productName: string;
  quantity?: number;
  amount: number;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  orderIds?: string[];
  baseOrderId?: string;
  itemBreakdown?: ItemBreakdown[];
  userId: string;
  paymentMode: string;
  amount: number;
  ourBankAccount: string;
  depositDate: string;
  depositBank: string;
  branchName: string;
  proofDriveLink: string;
  remarks: string;
  depositRefNo: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  customerName?: string;
  createdByRole?: string;
  approvedBy?: string;
  rejectedBy?: string;
  // Always a plain ISO string — never a Firestore Timestamp
  createdAt: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  metadata?: Record<string, any>;
}

// ─── Serializer — converts Timestamp → ISO string ────────────────────────────
function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v.seconds) return new Date(v.seconds * 1000).toISOString();
  if (typeof v === 'string') return v;
  return null;
}

function serializePayment(d: any, id: string): PaymentRecord {
  let actualRemarks = d.remarks ?? '';
  let extractedBreakdown = d.itemBreakdown ?? [];
  let extractedBaseOrderId = d.baseOrderId ?? null;

  if (typeof actualRemarks === 'string' && actualRemarks.includes('[[GROUP_DATA::')) {
    const match = actualRemarks.match(/\[\[GROUP_DATA::(.*?)\]\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.itemBreakdown) extractedBreakdown = parsed.itemBreakdown;
        if (parsed.baseOrderId) extractedBaseOrderId = parsed.baseOrderId;
      } catch (e) {}
      actualRemarks = actualRemarks.replace(/\[\[GROUP_DATA::.*?\]\]/, '').trim();
    }
  }

  return {
    id,
    orderId:        d.orderId         ?? '',
    orderIds:       d.orderIds        ?? [],
    baseOrderId:    extractedBaseOrderId,
    itemBreakdown:  extractedBreakdown,
    userId:         d.userId          ?? '',
    paymentMode:    d.paymentMode     ?? '',
    amount:         d.amount          ?? 0,
    ourBankAccount: d.ourBankAccount  ?? '',
    depositDate:    d.depositDate     ?? '',
    depositBank:    d.depositBank     ?? '',
    branchName:     d.branchName      ?? '',
    proofDriveLink: d.proofDriveLink  ?? '',
    remarks:        actualRemarks,
    depositRefNo:   d.depositRefNo    ?? '',
    status:         d.status          ?? 'PENDING',
    rejectionReason: d.rejectionReason,
    customerName:   d.customerName,
    createdByRole:  d.createdByRole,
    approvedBy:     d.approvedBy,
    rejectedBy:     d.rejectedBy,
    createdAt:      tsToIso(d.createdAt),
    approvedAt:     tsToIso(d.approvedAt),
    rejectedAt:     tsToIso(d.rejectedAt),
    metadata:       d.metadata,
  };
}

// ─── 1. SUBMIT PAYMENT (with overpayment + duplicate guard) ───────────────────
export async function submitPayment(data: {
  orderId: string;
  orderIds?: string[];        // For grouped multi-item orders
  baseOrderId?: string;       // Base order ID for grouped orders
  itemBreakdown?: ItemBreakdown[]; // Per-item amount breakdown
  paymentMode: string;
  amount: number;
  ourBankAccount: string;
  depositDate: string;
  depositBank: string;
  branchName: string;
  proofDriveLink: string;
  remarks: string;
  depositRefNo: string;
}): Promise<{ success: boolean; error?: string; paymentId?: string }> {
  try {
    const rateLimit = await checkRateLimit('submit_payment', 20, 60);
    if (!rateLimit.allowed) {
      return { success: false, error: 'Too many payment submissions. Please try again later.' };
    }

    const { uid, role } = await getAuthUser();
    
    // ── Check for Impersonation ──────────────────────────────────────────────
    const simulatedUserId = cookies().get('simulated_user_id')?.value;
    const isImpersonating = !!simulatedUserId && ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role);
    const targetUserId = isImpersonating ? simulatedUserId! : uid;

    // ── Basic validation ──────────────────────────────────────────────────────
    if (!data.orderId)       return { success: false, error: 'Order ID is required.' };
    if (!data.paymentMode)   return { success: false, error: 'Payment mode is required.' };
    if (data.amount <= 0)    return { success: false, error: 'Amount must be greater than zero.' };
    if (!data.ourBankAccount) return { success: false, error: 'Select our bank account.' };
    if (!data.depositDate)   return { success: false, error: 'Deposit date is required.' };
    if (!data.depositBank)   return { success: false, error: 'Enter deposited bank name.' };

    // ── Proof link validation ─────────────────────────────────────────────────
    const link = (data.proofDriveLink || '').trim();
    if (!link) return { success: false, error: 'Payment proof link is required.' };
    if (!link.startsWith('https://')) return { success: false, error: 'Proof link must start with https://' };
    // Accept Google Drive links or Firebase Storage URLs
    if (!link.includes('drive.google.com') && !link.includes('.appspot.com') && !link.includes('firebasestorage.googleapis.com') && !link.includes('cloudinary.com')) {
      return { success: false, error: 'Proof link must be a Google Drive link, Cloudinary URL, or a valid storage URL.' };
    }

    // ── Duplicate UTR/Ref check ──────────────────────────────────────────────
    if (data.depositRefNo && data.depositRefNo.trim()) {
      const dupSnap = await adminDb
        .collection('payments')
        .where('depositRefNo', '==', data.depositRefNo.trim())
        .limit(1)
        .get();
      if (!dupSnap.empty) {
        return { success: false, error: `Reference number "${data.depositRefNo}" has already been submitted. Duplicate prevented.` };
      }
    }

    let customerName: string | null = null;
    const isGroupedOrder = Array.isArray(data.orderIds) && data.orderIds.length > 1;

    // ── Overpayment check (skip for GENERAL account requests) ────────────────
    if (data.orderId !== 'GENERAL') {
      if (isGroupedOrder) {
        // Grouped order: validate against parent order total
        const parentOrderSnap = await adminDb.collection('orders').doc(data.baseOrderId!).get();
        if (!parentOrderSnap.exists) return { success: false, error: 'Parent order not found.' };
        const parentOrderData = parentOrderSnap.data() as any;
        customerName = parentOrderData.customerName || null;

        // Security: ensure order belongs to this customer
        if (parentOrderData.customerId !== targetUserId) {
          return { success: false, error: 'These orders do not belong to you.' };
        }

        const combinedTotal = parentOrderData.amounts?.grandTotal ?? 0;

        // Check if a payment for this group already exists
        const existingSnap = await adminDb
          .collection('payments')
          .where('orderId', '==', data.baseOrderId)
          .where('status', 'in', ['APPROVED', 'PENDING'])
          .get();
        const existingCommitted = existingSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        if (existingCommitted + data.amount > combinedTotal) {
          const remaining = combinedTotal - existingCommitted;
          return {
            success: false,
            error: remaining <= 0
              ? 'This group order is fully covered. No further payment needed.'
              : `Exceeds group total. Maximum you can submit: ₹${remaining.toLocaleString()}.`,
          };
        }
      } else {
        // Single order
        const orderSnap = await adminDb.collection('orders').doc(data.orderId).get();
        if (!orderSnap.exists) return { success: false, error: 'Order not found.' };
        const orderData = orderSnap.data() as any;
        customerName = orderData.customerName || null;

        // Security check: ensure the payment belongs to the order's customer
        if (orderData.customerId !== targetUserId) {
          return { success: false, error: 'This order does not belong to the selected customer.' };
        }

        const orderTotal = orderData.amounts?.grandTotal ?? 0;

        const existingSnap = await adminDb
          .collection('payments')
          .where('orderId', '==', data.orderId)
          .where('status', 'in', ['APPROVED', 'PENDING'])
          .get();

        const existingCommitted = existingSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        if (existingCommitted + data.amount > orderTotal) {
          const remaining = orderTotal - existingCommitted;
          return {
            success: false,
            error: remaining <= 0
              ? `This order is fully covered. No further payment needed.`
              : `Exceeds order total. Maximum you can submit now: ₹${remaining.toLocaleString()}.`,
          };
        }
      }
    }

    if (!customerName) {
      const profileSnap = await adminDb.collection('profiles').doc(targetUserId).get();
      if (profileSnap.exists) {
        customerName = profileSnap.data()?.name || profileSnap.data()?.displayName || null;
      }
    }

    // ── Save payment ──────────────────────────────────────────────────────────
    const paymentId = `PAY-${Date.now().toString().slice(-8)}`;
    await adminDb.collection('payments').doc(paymentId).set({
      id: paymentId,
      orderId: data.baseOrderId || data.orderId,  // Use baseOrderId as primary for grouped
      orderIds: isGroupedOrder ? data.orderIds : [],
      // removed baseOrderId and itemBreakdown to avoid schema errors, serialized below instead
      userId: targetUserId,
      customerName,
      paymentMode: data.paymentMode,
      amount: data.amount,
      ourBankAccount: data.ourBankAccount,
      depositDate: data.depositDate,
      depositBank: data.depositBank,
      branchName: data.branchName || '',
      proofDriveLink: link,
      remarks: data.baseOrderId || (data.itemBreakdown && data.itemBreakdown.length > 0)
        ? `${data.remarks || ''} [[GROUP_DATA::${JSON.stringify({ baseOrderId: data.baseOrderId, itemBreakdown: data.itemBreakdown })}]]`.trim()
        : (data.remarks || ''),
      depositRefNo: data.depositRefNo?.trim() || '',
      status: 'PENDING',
      submittedByAdmin: isImpersonating ? uid : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (data.orderId !== 'GENERAL') {
      const { updateStatsIncrementally } = await import('@/lib/stats');
      await adminDb.runTransaction(async (transaction) => {
        await updateStatsIncrementally(transaction, {
          'financial.totalPendingVerification': data.amount,
          'financial.totalUnpaid': -data.amount,
          'payments.pending': 1,
        });
      });
    }

    // ── Audit Log if Admin Proxy ──────────────────────────────────────────────
    if (isImpersonating) {
      const { writeAuditLog } = await import('@/lib/audit-log');
      await writeAuditLog({
        actedAs: targetUserId,
        actedAsType: 'CUSTOMER',
        actionType: 'SUBMIT_PAYMENT',
        entityType: 'PAYMENT',
        entityId: paymentId,
        meta: { orderId: data.orderId, amount: data.amount }
      });
    }

    if (isGroupedOrder && data.baseOrderId) {
      revalidatePath(`/dashboard/payment/group/${data.baseOrderId}`);
      data.orderIds!.forEach(id => revalidatePath(`/dashboard/payment/${id}`));
    } else {
      revalidatePath(`/dashboard/payment/${data.orderId}`);
    }
    revalidatePath('/accountant/payments');
    return { success: true, paymentId };
  } catch (err: any) {
    console.error('[submitPayment]', err);
    return { success: false, error: err.message || 'Failed to submit payment.' };
  }
}

// ─── 2. GET PAYMENTS FOR ORDER ─────────────────────────────────────────────────
export async function getPaymentsForOrder(orderId: string): Promise<PaymentRecord[]> {
  try {
    // Fetch by direct orderId
    const snap = await adminDb
      .collection('payments')
      .where('orderId', '==', orderId)
      .get();

    // Also fetch grouped payments that include this orderId in orderIds array
    const groupSnap = await adminDb
      .collection('payments')
      .where('orderIds', 'array-contains', orderId)
      .get();

    const allDocs = new Map<string, any>();
    snap.docs.forEach(d => allDocs.set(d.id, d));
    groupSnap.docs.forEach(d => allDocs.set(d.id, d)); // dedup by id

    const data = Array.from(allDocs.values())
      .map(d => serializePayment(d.data(), d.id))
      .sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tB - tA;
      });
    return JSON.parse(JSON.stringify(data));
  } catch (err: any) {
    console.error('[getPaymentsForOrder]', err);
    return [];
  }
}

// ─── 2b. GET GROUP ORDER SUMMARY (for group payment page) ─────────────────────
export async function getGroupOrderSummary(baseOrderId: string): Promise<{
  baseOrderId: string;
  grandTotal: number;
  baseValue: number;
  finishValue: number;
  logistics: number;
  gst: number;
  igst: number;
  cgst: number;
  sgst: number;
  customerName: string;
  customerId: string;
  orderType: string;
  items: { orderId: string; productName: string; quantity: number; amount: number; status: string; paymentStatus: string }[];
} | null> {
  try {
    const { supabaseServer } = await import('@/lib/supabase-server');
    // 1. Fetch parent order to get central pricing engine totals
    const { data: parentData, error: parentErr } = await supabaseServer
      .from('orders')
      .select('*')
      .eq('id', baseOrderId)
      .single();
    
    if (parentErr || !parentData) return null;

    // 2. Fetch all child orders that belong to this base order
    const { data: orders, error: ordersErr } = await supabaseServer
      .from('orders')
      .select('*')
      .eq('workflow->>baseOrderId', baseOrderId);

    if (ordersErr || !orders || orders.length === 0) return null;

    const grandTotal = parentData.amounts?.grandTotal ?? 0;
    const baseValue = (parentData.amounts?.productTotal || 0) + (parentData.amounts?.designCharges || 0) + (parentData.amounts?.packingCharges || 0);
    const finishValue = parentData.amounts?.finishCharges ?? 0;
    const logistics = parentData.amounts?.transport ?? parentData.amounts?.logistics ?? 0;
    const gst = parentData.amounts?.gst ?? 0;
    const igst = parentData.amounts?.igst ?? 0;
    const cgst = parentData.amounts?.cgst ?? 0;
    const sgst = parentData.amounts?.sgst ?? 0;

    return {
      baseOrderId,
      grandTotal,
      baseValue,
      finishValue,
      logistics,
      gst,
      igst,
      cgst,
      sgst,
      customerName: parentData.customerName || '',
      customerId: parentData.customerId || '',
      orderType: parentData.orderType || 'CASH',
      items: parentData.amounts?.items ? parentData.amounts.items.map((it: any, i: number) => {
        // Map ItemBreakdown to the expected format
        const orderId = orders[i]?.id || baseOrderId;
        const status = orders[i]?.status || 'PENDING';
        const paymentStatus = orders[i]?.paymentStatus || 'PENDING';
        return {
          orderId,
          productName: it.name,
          quantity: it.quantity ?? 1,
          amount: it.baseAmount,
          finishAmount: it.finishAmount,
          cgst: it.cgst,
          sgst: it.sgst,
          igst: it.igst,
          status,
          paymentStatus
        };
      }) : orders.map(o => {
        const item = o.items?.[0];
        const itemBaseAmount = item?.pricingSnapshot?.subTotal || item?.subTotal || 0;
        return {
          orderId: o.id,
          productName: item?.productName || item?.category || `Item ${o.id.split('-item')[1] || ''}`,
          quantity: item?.quantity ?? item?.qty ?? 1,
          amount: itemBaseAmount,
          finishAmount: item?.pricingSnapshot?.eyeletRate ? item.pricingSnapshot.eyeletRate * (item?.pricingSnapshot?.eyeletCount || 0) : 0,
          cgst: o.cgst_amount || 0,
          sgst: o.sgst_amount || 0,
          igst: o.igst_amount || 0,
          status: o.status,
          paymentStatus: o.paymentStatus ?? 'PENDING',
        };
      }),
    };
  } catch (err: any) {
    console.error('[getGroupOrderSummary]', err);
    return null;
  }
}

// ─── 3. GET ALL PENDING PAYMENTS (for accountant) ─────────────────────────────
export async function getAllPendingPayments(): Promise<PaymentRecord[]> {
  try {
    // 1. Fetch physical payments (UPI, Bank, etc.)
    // Removed orderBy to avoid requiring a composite index for (status, createdAt)
    const snap = await adminDb
      .collection('payments')
      .where('status', '==', 'PENDING')
      .get();
    const corePayments = snap.docs
      .map(d => serializePayment(d.data(), d.id))
      .filter(p => p.createdByRole !== 'ACDEMA');

    // 2. Fetch CREDIT orders awaiting verification
    // Removed orderBy to avoid requiring a composite index for (orderType, paymentStatus, createdAt)
    const orderSnap = await adminDb
      .collection('orders')
      .where('orderType', '==', 'CREDIT')
      .where('paymentStatus', '==', 'PENDING')
      .limit(50)
      .get();

    // To provide "previous/current amount" in the UI, we'll fetch profile data in chunks of 10
    const profileIds = Array.from(new Set(orderSnap.docs.map(d => d.data().customerId)));
    const profiles: Record<string, any> = {};
    
    if (profileIds.length > 0) {
      // Firestore 'in' queries are limited to 30 items (for documentId)
      for (let i = 0; i < profileIds.length; i += 30) {
        const chunk = profileIds.slice(i, i + 30);
        const pSnaps = await adminDb.collection('profiles')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        pSnaps.forEach(p => { profiles[p.id] = p.data(); });
      }
    }

    // Group pending credit orders by baseOrderId
    const creditGroups: Record<string, {
      baseOrderId: string;
      customerId: string;
      customerName: string;
      createdAt: any;
      items: ItemBreakdown[];
      totalAmount: number;
    }> = {};

    orderSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.createdByRole === 'ACDEMA') return;

      const baseOrderId = d.baseOrderId || doc.id;
      if (!creditGroups[baseOrderId]) {
        creditGroups[baseOrderId] = {
          baseOrderId,
          customerId: d.customerId,
          customerName: d.customerName || 'Customer',
          createdAt: d.createdAt,
          items: [],
          totalAmount: 0,
        };
      }
      
      const itemData = d.items?.[0] || {};
      creditGroups[baseOrderId].items.push({
        orderId: doc.id,
        productName: itemData.productName || itemData.category || 'Product Item',
        quantity: itemData.quantity || 1,
        amount: d.amounts?.grandTotal || 0,
      });
      creditGroups[baseOrderId].totalAmount += (d.amounts?.grandTotal || 0);
    });

    const creditReconstructions: PaymentRecord[] = Object.values(creditGroups).map(group => {
      const prof = profiles[group.customerId] || {};
      const usedCreditNow = prof.usedCredit || 0;

      return {
        id: `V-CREDIT-${group.baseOrderId}`,
        orderId: group.baseOrderId,
        orderIds: group.items.map(it => it.orderId),
        baseOrderId: group.baseOrderId,
        userId: group.customerId,
        paymentMode: 'CREDIT_ACCOUNT',
        amount: group.totalAmount,
        ourBankAccount: 'CREDIT_LEDGER',
        depositDate: tsToIso(group.createdAt) || '',
        depositBank: 'INTERNAL',
        branchName: 'CREDIT_LIMIT',
        proofDriveLink: '',
        remarks: `Auto-generated. Current Utilization: ₹${usedCreditNow.toLocaleString()}`,
        depositRefNo: `BAL:${usedCreditNow - group.totalAmount}|${prof.creditLimit || 0}|${usedCreditNow}`,
        status: 'PENDING',
        customerName: group.customerName,
        createdAt: tsToIso(group.createdAt),
        itemBreakdown: group.items,
      };
    });

    // 3. Combine and Deduplicate
    // If a payment already exists in 'payments' collection with V-CREDIT- prefix, 
    // we don't need the reconstruction from the orders collection.
    const existingVCreditOrderIds = new Set(
      corePayments
        .filter(p => p.id.startsWith('V-CREDIT-'))
        .map(p => p.orderId)
    );

    const filteredReconstructions = creditReconstructions.filter(
      r => !existingVCreditOrderIds.has(r.orderId)
    );

    const combined = [...corePayments, ...filteredReconstructions].sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

    return JSON.parse(JSON.stringify(combined));
  } catch (err: any) {
    console.error('[getAllPendingPayments] CRITICAL ERROR:', err);
    return [];
  }
}

// ─── 3b. GET ALL PAYMENTS for accountant full view ────────────────────────────
export async function getAllPaymentsAdmin(): Promise<PaymentRecord[]> {
  try {
    const snap = await adminDb
      .collection('payments')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    const data = snap.docs.map(d => serializePayment(d.data(), d.id));
    return JSON.parse(JSON.stringify(data));
  } catch (err: any) {
    console.error('[getAllPaymentsAdmin]', err);
    return [];
  }
}


// ─── 4. APPROVE PAYMENT (accountant only) ────────────────────────────────────
export async function approvePayment(
  paymentId: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const { uid, role, roles } = await getAuthUser();
    const isAllowed = roles.includes('ACCOUNTANT') || roles.includes('ADMIN') || roles.includes('SUPER_ADMIN') || roles.includes('ACDEMA');
    if (!isAllowed) {
      return { success: false, error: 'Permission denied. Only Accountants, Admins, and Acdema can approve payments.' };
    }

    // ─── Handle Virtual Credit Approvals ───
    if (paymentId.startsWith('V-CREDIT-')) {
      const targetOrderId = paymentId.replace('V-CREDIT-', '');
      const orderRef = adminDb.collection('orders').doc(targetOrderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) return { success: false, error: 'Credit order not found.' };
      
      const orderData = orderSnap.data() as any;
      const baseOrderId = orderData.baseOrderId || targetOrderId;

      // Fetch all child orders in the group
      const childOrdersSnap = await adminDb
        .collection('orders')
        .where('baseOrderId', '==', baseOrderId)
        .get();

      const allDocIds = new Set<string>();
      const docSnaps: admin.firestore.DocumentSnapshot[] = [];

      // Add parent if exists
      const parentOrderRef = adminDb.collection('orders').doc(baseOrderId);
      const parentOrderSnap = await parentOrderRef.get();
      if (parentOrderSnap.exists) {
        allDocIds.add(parentOrderSnap.id);
        docSnaps.push(parentOrderSnap);
      }

      childOrdersSnap.docs.forEach(doc => {
        if (!allDocIds.has(doc.id)) {
          allDocIds.add(doc.id);
          docSnaps.push(doc);
        }
      });

      const orderIdsToProcess = Array.from(allDocIds);

      // Fetch related transaction entries for all these order IDs
      const txSnaps = await adminDb.collection('transactions')
        .where('refId', 'in', orderIdsToProcess)
        .where('type', '==', 'SALE')
        .get();

      const profRef = adminDb.collection('profiles').doc(orderData.customerId);

      await adminDb.runTransaction(async (tx) => {
        const profSnap = await tx.get(profRef);
        const profData = profSnap.data() || {};
        let runningSpendIncrement = 0;

        for (const oSnap of docSnaps) {
          const oData = oSnap.data() as any;
          if (oData.paymentStatus !== 'PENDING') continue;

          // Advance workflow snapshot to next step
          let currentWorkflowRole: string | null = oData.currentWorkflowRole ?? null;
          let currentWorkflowLabel: string | null = oData.currentWorkflowLabel ?? null;
          let updatedSnapshot = oData.workflowSnapshot ?? null;

          if (oData.workflowSnapshot && Array.isArray(oData.workflowSnapshot.steps)) {
            const snapshot = oData.workflowSnapshot;
            const currentIdx = snapshot.currentStepIndex ?? 0;
            if (currentIdx < snapshot.steps.length && snapshot.steps[currentIdx].role === 'ACCOUNTANT') {
              const steps = [...snapshot.steps];
              steps[currentIdx] = {
                ...steps[currentIdx],
                status: 'COMPLETED',
                completedAt: new Date().toISOString(),
                completedBy: uid,
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

          tx.update(adminDb.collection('orders').doc(oSnap.id), {
            paymentStatus: 'VERIFIED',
            'workflow.paymentVerifiedAt': admin.firestore.FieldValue.serverTimestamp(),
            'workflow.paymentVerifiedBy': uid,
            status: 'PAYMENT_VERIFIED', // Advance to verified state
            workflowSnapshot: updatedSnapshot,
            currentWorkflowRole,
            currentWorkflowLabel,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Also set the virtual payment record to APPROVED in the payments collection
          const vPaymentId = `V-CREDIT-${oSnap.id}`;
          const vPaymentRef = adminDb.collection('payments').doc(vPaymentId);
          tx.set(vPaymentRef, {
            id: vPaymentId,
            orderId: oSnap.id,
            userId: oData.customerId,
            customerName: oData.customerName || 'Customer',
            paymentMode: 'CREDIT_ACCOUNT',
            amount: oData.amounts?.grandTotal || 0,
            ourBankAccount: 'CREDIT_LEDGER',
            depositDate: tsToIso(oData.createdAt) || new Date().toISOString(),
            depositBank: 'INTERNAL',
            branchName: 'CREDIT_LIMIT',
            proofDriveLink: '',
            remarks: 'Credit order approved.',
            status: 'APPROVED',
            approvedBy: uid,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          runningSpendIncrement += (oData.amounts?.grandTotal || 0);
        }

        // Also set the group virtual payment record V-CREDIT-[baseOrderId] to APPROVED
        const groupPaymentRef = adminDb.collection('payments').doc(paymentId);
        tx.set(groupPaymentRef, {
          id: paymentId,
          orderId: baseOrderId,
          orderIds: orderIdsToProcess,
          userId: orderData.customerId,
          customerName: orderData.customerName || 'Customer',
          paymentMode: 'CREDIT_ACCOUNT',
          amount: docSnaps.reduce((sum, s) => sum + ((s.data() as any)?.amounts?.grandTotal || 0), 0),
          ourBankAccount: 'CREDIT_LEDGER',
          depositDate: orderData.createdAt ? new Date(orderData.createdAt).toISOString() : new Date().toISOString(),
          depositBank: 'INTERNAL',
          branchName: 'CREDIT_LIMIT',
          proofDriveLink: '',
          remarks: 'Group credit payment approved.',
          status: 'APPROVED',
          approvedBy: uid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      }); // end tx

      revalidatePath('/accountant/payments');
      revalidatePath('/accountant/ledger');
      orderIdsToProcess.forEach((id) => revalidatePath(`/dashboard/payment/${id}`));
      return { success: true };
    }

      // --- Handle Standard Payments ---
        const payRef = adminDb.collection('payments').doc(paymentId);
        const paySnap = await payRef.get();
        if (!paySnap.exists) return { success: false, error: 'Payment record not found.' };

        const payment = paySnap.data() as any;
        if (payment.status !== 'PENDING') {
          return { success: false, error: 'Payment is not pending.' };
        }

        const orderIdsToProcess = Array.isArray(payment.orderIds) && payment.orderIds.length > 0
          ? payment.orderIds
          : [payment.orderId];

        await adminDb.runTransaction(async (tx) => {
          // 1. Mark the payment record as APPROVED
          tx.update(payRef, {
            status: 'APPROVED',
            approvedBy: uid,
            approvedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // 2. Fetch and update all related orders
          const orderRefs = orderIdsToProcess.map((id: string) => adminDb.collection('orders').doc(id));
          const docSnaps = await tx.getAll(...orderRefs);

          for (const oSnap of docSnaps) {
            if (!oSnap.exists) continue;
            const oData = oSnap.data() as any;
            
            // Advance workflow snapshot to next step
            let currentWorkflowRole: string | null = oData.currentWorkflowRole ?? null;
            let currentWorkflowLabel: string | null = oData.currentWorkflowLabel ?? null;
            let updatedSnapshot = oData.workflowSnapshot ?? null;

            if (oData.workflowSnapshot && Array.isArray(oData.workflowSnapshot.steps)) {
              const snapshot = oData.workflowSnapshot;
              const currentIdx = snapshot.currentStepIndex ?? 0;
              if (currentIdx < snapshot.steps.length && snapshot.steps[currentIdx].role === 'ACCOUNTANT') {
                const steps = [...snapshot.steps];
                steps[currentIdx] = {
                  ...steps[currentIdx],
                  status: 'COMPLETED',
                  completedAt: new Date().toISOString(),
                  completedBy: uid,
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

            tx.update(oSnap.ref, {
              paymentStatus: 'VERIFIED',
              'workflow.paymentVerifiedAt': admin.firestore.FieldValue.serverTimestamp(),
              'workflow.paymentVerifiedBy': uid,
              status: 'PAYMENT_VERIFIED', // Advance to verified state
              workflowSnapshot: typeof updatedSnapshot === 'object' ? updatedSnapshot : JSON.parse(updatedSnapshot),
              currentWorkflowRole,
              currentWorkflowLabel,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }

          // 3. Mark the matching SALE transaction(s) in the transactions collection as verified
          // Find transaction(s) linked to any of the orderIds in this payment
          const baseOrderId = payment.baseOrderId || payment.orderId || orderIdsToProcess[0];
          const txQuery = adminDb.collection('transactions')
            .where('userId', '==', payment.userId)
            .where('refId', '==', baseOrderId);
          const txSnap = await txQuery.get();

          for (const txDoc of txSnap.docs) {
            tx.update(txDoc.ref, {
              isVerified: true,
              verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
              verifiedBy: uid,
              approvedBy: uid,
              paymentId: paymentId,
            });
          }

          // Also try matching by any of the child orderIds if no parent match found
          if (txSnap.empty) {
            for (const ordId of orderIdsToProcess) {
              const childTxQuery = adminDb.collection('transactions')
                .where('userId', '==', payment.userId)
                .where('refId', '==', ordId);
              const childTxSnap = await childTxQuery.get();
              for (const txDoc of childTxSnap.docs) {
                tx.update(txDoc.ref, {
                  isVerified: true,
                  verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                  verifiedBy: uid,
                  approvedBy: uid,
                  paymentId: paymentId,
                });
              }
            }
          }
        }); // end tx

        // 4. Create a RECEIPT transaction so it appears in the Account Ledger
        try {
          const receiptTxId = `TX-RECEIPT-${paymentId}-${Date.now()}`;
          await adminDb.collection('transactions').doc(receiptTxId).set({
            id: receiptTxId,
            userId: payment.userId,
            type: 'RECEIPT',
            ledgerType: payment.paymentMode || 'CASH',
            refId: payment.orderId || orderIdsToProcess[0],
            paymentId: paymentId,
            debit: 0,
            credit: Number(payment.amount) || 0,
            balanceBefore: 0,        // computed on read in LedgerDetailView
            balanceAfter: 0,         // computed on read in LedgerDetailView
            availableCredit: 0,
            remarks: `Payment received for Order ${payment.orderId || orderIdsToProcess[0]} via ${payment.paymentMode || 'BANK_TRANSFER'}`,
            createdBy: uid,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            isVerified: true,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            verifiedBy: uid,
            approvedBy: uid,
          });
        } catch (receiptErr) {
          // Non-fatal — ledger receipt creation failed, log and continue
          console.error('Failed to create RECEIPT transaction:', receiptErr);
        }

        // 5. Update global stats (decrement pending)
        const { updateStatsIncrementally } = await import('@/lib/stats');
        await adminDb.runTransaction(async (t) => {
           await updateStatsIncrementally(t, {
              'payments.pending': -1,
           });
        });

        revalidatePath('/accountant/payments');
        revalidatePath('/accountant/ledger');
        orderIdsToProcess.forEach((id: string) => revalidatePath(`/dashboard/payment/${id}`));
        return { success: true };
  } catch (error: any) {
    console.error('Approve payment error:', error);
    return { success: false, error: error.message };
  }
}

export async function rejectPayment(paymentId: string, reason: string) {
  try {
    const { uid } = await getAuthUser();
    
    // Using a transaction to ensure atomicity
    await adminDb.runTransaction(async (tx) => {
      const payRef = adminDb.collection('payments').doc(paymentId);
      const paySnap = await tx.get(payRef);
      if (!paySnap.exists) throw new Error('Payment record not found.');
      
      const payment = paySnap.data() as any;
      if (payment.status !== 'PENDING') {
        throw new Error('Only PENDING payments can be rejected.');
      }

      const orderIdsToProcess = Array.isArray(payment.orderIds) && payment.orderIds.length > 0
        ? payment.orderIds
        : [payment.orderId];

      const baseOrderId = payment.orderId.split('-item')[0];
      let isGroupCreditPayment = false;
      let runningSpendDecrement = 0;

      // 1. Mark the payment record as REJECTED
      tx.update(payRef, {
        status: 'REJECTED',
        rejectionReason: reason || 'Rejected by accountant',
        rejectedBy: uid,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. Fetch and update all related orders
      const orderRefs = orderIdsToProcess.map((id: string) => adminDb.collection('orders').doc(id));
      const docSnaps = await tx.getAll(...orderRefs);
      
      for (const oSnap of docSnaps) {
        if (!oSnap.exists) continue;
        const oData = oSnap.data() as any;
        
        if (oData.orderType === 'CREDIT' || payment.paymentMode === 'CREDIT_ACCOUNT') {
          isGroupCreditPayment = true;
          runningSpendDecrement += (oData.amounts?.grandTotal || 0);
          
          // Reject individual virtual payment
          const vPaymentId = `V-CREDIT-${oSnap.id}`;
          const vPaymentRef = adminDb.collection('payments').doc(vPaymentId);
          const vPaySnap = await tx.get(vPaymentRef);
          if (vPaySnap.exists) {
            tx.update(vPaymentRef, {
              status: 'REJECTED',
              rejectionReason: reason || 'Group credit payment rejected',
              rejectedBy: uid,
              rejectedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }

        // Revert workflow step to REJECTED
        let wfSnapshot = typeof oData.workflowSnapshot === 'string' ? JSON.parse(oData.workflowSnapshot) : oData.workflowSnapshot;
        if (wfSnapshot && Array.isArray(wfSnapshot.steps)) {
          wfSnapshot.steps = wfSnapshot.steps.map((step: any) => {
            if (step.id === 'step-accountant') {
              return { ...step, status: 'REJECTED', notes: reason || 'Payment rejected' };
            }
            return step;
          });
        }

        tx.update(oSnap.ref, {
          paymentStatus: 'REJECTED',
          workflowSnapshot: typeof oData.workflowSnapshot === 'string' ? JSON.stringify(wfSnapshot) : wfSnapshot
        });
      }

      // 3. Revert credit limit if it was a credit order
      if (isGroupCreditPayment && runningSpendDecrement > 0) {
        const profRef = adminDb.collection('customer_profiles').doc(payment.userId);
        tx.update(profRef, {
          usedCredit: admin.firestore.FieldValue.increment(-runningSpendDecrement)
        });
      }

      // 4. Delete SALE transactions created for this order
      const txSnaps = await adminDb.collection('transactions')
        .where('orderId', '==', baseOrderId)
        .where('type', '==', 'SALE')
        .get();
        
      for (const txDoc of txSnaps.docs) {
        tx.delete(adminDb.collection('transactions').doc(txDoc.id));
      }
    });

    revalidatePath('/accountant/payments');
    revalidatePath('/accountant/ledger');
    return { success: true };
  } catch (error: any) {
    console.error('Reject payment error:', error);
    return { success: false, error: error.message };
  }
}

export async function getOrderSummary(orderId: string) {
  try {
    if (!orderId) throw new Error('Order ID is required');

    // Fetch the base order
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    
    // Also fetch children if it's a group order
    const childrenQuery = await adminDb.collection('orders')
      .where('workflow.baseOrderId', '==', orderId)
      .get();
      
    // Determine the docs to process
    let docs: any[] = [];
    if (orderSnap.exists) {
      docs.push(orderSnap);
    }
    if (!childrenQuery.empty) {
      childrenQuery.docs.forEach(d => docs.push(d));
    }
    
    if (docs.length === 0) return null;

    // We take the first doc as the primary reference for status and type
    const mainData = docs[0].data() as any;
    
    // Collect all orderIds (base + items)
    const allIds = Array.from(new Set(docs.map(d => d.id)));

    // Try to parse items if it's a single item stored in 'items' field
    let parsedItems = [];
    if (mainData.items) {
      try {
        parsedItems = typeof mainData.items === 'string' ? JSON.parse(mainData.items) : mainData.items;
      } catch (e) {}
    }

    // The base order (mainData) already contains the total for all children in its amounts.grandTotal.
    // Summing both the parent and children would double the amount.
    let grandTotal = mainData.amounts?.grandTotal || 0;
    
    // Fallback: if parent has 0 but we have children, sum the children
    if (!grandTotal && !childrenQuery.empty) {
       grandTotal = childrenQuery.docs.reduce((sum, d) => sum + (d.data().amounts?.grandTotal || 0), 0);
    }

    return {
      grandTotal,
      status: mainData.status || 'PLACED',
      orderType: mainData.orderType || 'CASH',
      customerId: mainData.customerId,
      paymentStatus: mainData.paymentStatus || 'PENDING',
      groupOrderIds: allIds,
      amounts: mainData.amounts || {},
      items: parsedItems,
      
      // Detailed item breakdown fields
      cgst_amount: Number(mainData.cgst_amount || 0),
      sgst_amount: Number(mainData.sgst_amount || 0),
      igst_amount: Number(mainData.igst_amount || 0),
      item_amount: Number(mainData.item_amount || 0),
      allocated_logistics_amount: Number(mainData.allocated_logistics_amount || 0)
    };
  } catch (error) {
    console.error('Error fetching order summary:', error);
    return null;
  }
}

// ─── CUSTOMER PAYMENT REQUEST ACTIONS (ORDER = GENERAL) ─────────────

export async function approveCustomerPaymentRequest(paymentId: string) {
  try {
    const { uid, role, roles } = await getAuthUser();
    const isAllowed = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
    if (!isAllowed) {
      return { success: false, error: 'Permission denied. Only Admins can approve credit requests.' };
    }

    await adminDb.runTransaction(async (tx) => {
      const payRef = adminDb.collection('payments').doc(paymentId);
      const paySnap = await tx.get(payRef);
      if (!paySnap.exists) throw new Error('Payment record not found.');
      
      const payment = paySnap.data() as any;
      if (payment.status !== 'PENDING') {
        throw new Error('Only PENDING requests can be approved.');
      }
      if (payment.orderId !== 'GENERAL') {
        throw new Error('This action is only for GENERAL credit requests.');
      }

      // 1. Mark the payment record as APPROVED
      tx.update(payRef, {
        status: 'APPROVED',
        approvedBy: uid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. Create a RECEIPT transaction which automatically acts as credit in the ledger
      const receiptTxId = `TX-RECEIPT-${paymentId}-${Date.now()}`;
      tx.set(adminDb.collection('transactions').doc(receiptTxId), {
        id: receiptTxId,
        userId: payment.userId,
        type: 'RECEIPT',
        ledgerType: payment.paymentMode || 'BANK_TRANSFER',
        refId: 'CREDIT_TOPUP',
        paymentId: paymentId,
        debit: 0,
        credit: Number(payment.amount) || 0,
        balanceBefore: 0,        
        balanceAfter: 0,         
        availableCredit: 0,
        remarks: payment.remarks ? `Credit Request: ${payment.remarks}` : `Credit Request Approved via ${payment.paymentMode}`,
        createdBy: uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isVerified: true,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        verifiedBy: uid,
        approvedBy: uid,
      });

      // 3. Decrease usedCredit directly on the profile so available credit increases
      const profileRef = adminDb.collection('profiles').doc(payment.userId);
      const profileSnap = await tx.get(profileRef);
      if (profileSnap.exists) {
         const pData = profileSnap.data() as any;
         const currentUsed = pData.usedCredit || 0;
         tx.update(profileRef, { usedCredit: currentUsed - (Number(payment.amount) || 0) });
      }
    });

    const { updateStatsIncrementally } = await import('@/lib/stats');
    await adminDb.runTransaction(async (t) => {
        await updateStatsIncrementally(t, {
          'payments.pending': -1,
        });
    });

    revalidatePath('/admin/customers');
    revalidatePath('/admin/customers/payment-requests');
    return { success: true };
  } catch (error: any) {
    console.error('Approve customer payment request error:', error);
    return { success: false, error: error.message };
  }
}

export async function rejectCustomerPaymentRequest(paymentId: string, reason: string) {
  try {
    const { uid, roles } = await getAuthUser();
    const isAllowed = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
    if (!isAllowed) {
      return { success: false, error: 'Permission denied. Only Admins can reject credit requests.' };
    }

    await adminDb.runTransaction(async (tx) => {
      const payRef = adminDb.collection('payments').doc(paymentId);
      const paySnap = await tx.get(payRef);
      if (!paySnap.exists) throw new Error('Payment record not found.');
      
      const payment = paySnap.data() as any;
      if (payment.status !== 'PENDING') {
        throw new Error('Only PENDING requests can be rejected.');
      }

      tx.update(payRef, {
        status: 'REJECTED',
        rejectionReason: reason || 'Rejected by admin',
        rejectedBy: uid,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    const { updateStatsIncrementally } = await import('@/lib/stats');
    await adminDb.runTransaction(async (t) => {
        await updateStatsIncrementally(t, {
          'payments.pending': -1,
        });
    });

    revalidatePath('/admin/customers');
    revalidatePath('/admin/customers/payment-requests');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
