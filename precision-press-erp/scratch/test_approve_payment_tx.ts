require('dotenv').config({ path: '.env.local' });
const { adminDb, firestore } = require('../src/lib/firebase-admin');
const admin = require('../src/lib/firebase-admin');

async function main() {
  const paymentId = 'PAY-40808308';
  const uid = 'system-test';
  try {
    console.log(`Dry-running payment approval for ${paymentId}...`);
    const payRef = adminDb.collection('payments').doc(paymentId);
    const paySnap = await payRef.get();
    if (!paySnap.exists) {
      console.log('Payment record not found.');
      return;
    }
    
    const payment = paySnap.data();
    console.log('Payment status:', payment.status);

    const orderRef = adminDb.collection('orders').doc(payment.orderId);
    const profRef = adminDb.collection('profiles').doc(payment.userId);

    console.log('Fetching previous approved payments...');
    const previousApprovedSnap = await adminDb
      .collection('payments')
      .where('orderId', '==', payment.orderId)
      .where('status', '==', 'APPROVED')
      .get();
    console.log(`Found ${previousApprovedSnap.size} previously approved payments.`);

    let totalApproved = 0;
    let orderTotal = 0;

    console.log('Starting transaction...');
    await adminDb.runTransaction(async (tx) => {
      console.log('Inside transaction: reading order...');
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error('Order not found.');
      const order = orderSnap.data();
      console.log('Order found. Grand total:', order.amounts?.grandTotal);

      console.log('Inside transaction: reading profile...');
      const profSnap = await tx.get(profRef);
      const profData = profSnap.data() || {};
      const currentUsed = profData.usedCredit || 0;
      console.log('Profile found. usedCredit:', currentUsed);

      // Writes
      console.log('Inside transaction: updating payment status to APPROVED...');
      tx.update(payRef, {
        status: 'APPROVED',
        approvedBy: uid,
        approvedAt: firestore.FieldValue.serverTimestamp(),
      });

      totalApproved = payment.amount;
      previousApprovedSnap.forEach(d => {
        if (d.id !== paymentId) totalApproved += (d.data().amount || 0);
      });
      orderTotal = order.amounts?.grandTotal ?? 0;
      console.log(`Total Approved amount calculation: ${totalApproved} / Order Total: ${orderTotal}`);

      const paymentStatus = totalApproved >= orderTotal ? 'VERIFIED' : 'PARTIAL';
      const isFullyPaid = totalApproved >= orderTotal;

      let currentWorkflowRole = order.currentWorkflowRole ?? null;
      let currentWorkflowLabel = order.currentWorkflowLabel ?? null;
      let updatedSnapshot = order.workflowSnapshot ?? null;

      if (isFullyPaid && order.workflowSnapshot && Array.isArray(order.workflowSnapshot.steps)) {
        const snapshot = order.workflowSnapshot;
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

      console.log('Inside transaction: updating order...');
      tx.update(orderRef, {
        paymentStatus,
        status: isFullyPaid ? 'PAYMENT_VERIFIED' : order.status,
        ...(updatedSnapshot !== order.workflowSnapshot && { workflowSnapshot: updatedSnapshot }),
        currentWorkflowRole,
        currentWorkflowLabel,
        updatedAt: firestore.FieldValue.serverTimestamp(),
        [`workflow.paymentVerifiedAt`]: isFullyPaid
          ? firestore.FieldValue.serverTimestamp()
          : null,
      });

      console.log('Inside transaction: creating ledger entry...');
      const txId = `TX-PAY-${Date.now()}`;
      const txRef = adminDb.collection('transactions').doc(txId);
      
      tx.set(txRef, {
        userId: payment.userId,
        type: 'RECEIPT',
        ledgerType: order.orderType,
        refId: payment.orderId,
        paymentId: paymentId,
        credit: payment.amount,
        debit: 0,
        balanceBefore: currentUsed,
        balanceAfter: Math.max(0, currentUsed - payment.amount),
        remarks: `Payment approved: ${paymentId} for Order ${payment.orderId}`,
        approvedBy: uid,
        isVerified: true,
        verifiedBy: uid,
        verifiedAt: firestore.FieldValue.serverTimestamp(),
        paymentMode: payment.paymentMode,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      console.log('Inside transaction: updating profile totals...');
      tx.update(profRef, {
        usedCredit: firestore.FieldValue.increment(-payment.amount),
        'membership.totalPayments': firestore.FieldValue.increment(payment.amount),
        updatedAt: firestore.FieldValue.serverTimestamp()
      });
    });

    console.log('Transaction completed successfully!');
  } catch (err) {
    console.error('Transaction failed:', err);
  }
}

main();
