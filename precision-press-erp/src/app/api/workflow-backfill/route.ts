export const dynamic = 'force-dynamic';
import { adminDb as db, firestore } from '@/lib/firebase-admin';
import { NextResponse } from 'next/server';

// Standard 7-stage production workflow shared across all products
const DEFAULT_WORKFLOW_STEPS = [
  { id: 'step-accountant', label: 'Accounts Approval', role: 'ACCOUNTANT', description: 'Financial verification and order approval', blocking: true },
  { id: 'step-designer',   label: 'Design & Artwork',   role: 'DESIGNER',   description: 'Pre-press design, proofing and artwork preparation', blocking: true },
  { id: 'step-manager',    label: 'Manager Sign-off',   role: 'MANAGER',    description: 'Quality check and production authorization', blocking: true },
  { id: 'step-printer',    label: 'Printing',           role: 'PRINTER',    description: 'Production printing run', blocking: true },
  { id: 'step-pasting',    label: 'Pasting',            role: 'PASTING',    description: 'Application, lamination and mounting', blocking: false },
  { id: 'step-dispatch',   label: 'Dispatch',           role: 'DISPATCH',   description: 'Pack, label and hand-over for delivery', blocking: true },
  { id: 'step-delivery',   label: 'Delivery',           role: 'DELIVERY',   description: 'Final delivery to customer site', blocking: false },
];

/**
 * Maps a legacy order status to which workflow step index it corresponds to.
 * This lets us reconstruct a meaningful workflowSnapshot for legacy orders.
 */
function getStepIndexForStatus(status: string): number {
  const map: Record<string, number> = {
    'PLACED':               0,
    'ON_HOLD':              0,
    'ACCOUNTANT_APPROVED':  1, // accountant done → designer's turn
    'DESIGNING':            1,
    'DESIGN_READY':         2, // designer done → manager's turn
    'PAYMENT_PENDING':      2,
    'PAYMENT_VERIFIED':     2,
    'ASSIGNED':             3, // manager done → printer
    'IN_PROGRESS':          3,
    'PRODUCTION_PAUSED':    3,
    'COMPLETED':            5, // printing done → dispatch
    'DISPATCHED':           6,
    'IN_TRANSIT':           6,
    'DELIVERED':            6,
    'CANCELLED':            0,
    'REJECTED':             0,
  };
  return map[status] ?? 0;
}

/**
 * Maps a legacy status to what the current step's status should be.
 */
function getStepStatusForOrderStatus(status: string): string {
  if (['COMPLETED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED'].includes(status)) return 'COMPLETED';
  if (['IN_PROGRESS', 'DESIGNING'].includes(status)) return 'IN_PROGRESS';
  if (['CANCELLED', 'REJECTED'].includes(status)) return 'REJECTED';
  return 'PENDING';
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get('dry') !== 'false'; // default is dry run (safe)

  try {
    let productsPatched = 0;
    let ordersPatched = 0;
    const logs: string[] = [];

    // ── STEP 1: Patch products missing workflowSteps ────────────────────────
    const productsSnap = await db.collection('products').get();
    const productBatch = db.batch();

    for (const docSnap of productsSnap.docs) {
      const data = docSnap.data();
      if (!data.workflowSteps || data.workflowSteps.length === 0) {
        logs.push(`[PRODUCT] ${docSnap.id} — will add ${DEFAULT_WORKFLOW_STEPS.length} workflow steps`);
        if (!dryRun) {
          productBatch.update(docSnap.ref, {
            workflowSteps: DEFAULT_WORKFLOW_STEPS,
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        }
        productsPatched++;
      }
    }
    if (!dryRun) await productBatch.commit();

    // ── STEP 2: Patch active orders missing workflowSnapshot ───────────────
    const ordersSnap = await db.collection('orders')
      .where('status', 'not-in', ['DELIVERED', 'CANCELLED', 'REJECTED'])
      .get();

    // Firestore limits batch to 500 writes
    let orderBatch = db.batch();
    let batchCount = 0;

    for (const docSnap of ordersSnap.docs) {
      const data = docSnap.data();

      if (!data.workflowSnapshot || !data.workflowSnapshot.steps?.length) {
        const status: string = data.status || 'PLACED';
        const currentStepIndex = getStepIndexForStatus(status);
        const stepStatus = getStepStatusForOrderStatus(status);

        // Build snapshot: all prior steps COMPLETED, current = stepStatus, rest = LOCKED
        const steps = DEFAULT_WORKFLOW_STEPS.map((step, idx) => ({
          ...step,
          status: idx < currentStepIndex ? 'COMPLETED' : idx === currentStepIndex ? stepStatus : 'LOCKED',
          startedAt: idx < currentStepIndex ? data.createdAt : undefined,
          completedAt: idx < currentStepIndex ? data.updatedAt : undefined,
          completedBy: idx < currentStepIndex ? 'SYSTEM_BACKFILL' : undefined,
          notes: idx < currentStepIndex ? 'Auto-backfilled from order status.' : '',
        }));

        const workflowSnapshot = {
          steps,
          currentStepIndex,
          templateId: 'default-7-stage',
          version: 1,
        };

        const currentRole = DEFAULT_WORKFLOW_STEPS[currentStepIndex]?.role ?? null;
        const currentLabel = DEFAULT_WORKFLOW_STEPS[currentStepIndex]?.label ?? null;

        logs.push(
          `[ORDER] ${docSnap.id} (${status}) → stepIdx=${currentStepIndex} role=${currentRole}`
        );

        if (!dryRun) {
          orderBatch.update(docSnap.ref, {
            workflowSnapshot,
            currentWorkflowRole: currentRole,
            currentWorkflowLabel: currentLabel,
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
          batchCount++;

          // Commit and reset batch every 490 writes
          if (batchCount >= 490) {
            await orderBatch.commit();
            orderBatch = db.batch();
            batchCount = 0;
          }
        }

        ordersPatched++;
      }
    }

    if (!dryRun && batchCount > 0) await orderBatch.commit();

    return NextResponse.json({
      success: true,
      dryRun,
      productsPatched,
      ordersPatched,
      message: dryRun
        ? `DRY RUN: Would patch ${productsPatched} products and ${ordersPatched} orders. Visit /api/workflow-backfill?dry=false to apply.`
        : `Backfill complete. Patched ${productsPatched} products and ${ordersPatched} orders.`,
      logs: dryRun ? logs : [`Applied ${logs.length} changes.`],
    });
  } catch (error: any) {
    console.error('[Backfill Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
