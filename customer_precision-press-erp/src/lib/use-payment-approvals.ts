// @ts-nocheck
import { useEffect, useState, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, Unsubscribe } from '@/lib/supabase-firestore-shim';
import { getAllPendingPayments, getAllPaymentsAdmin, approvePayment, rejectPayment, PaymentRecord } from '@/lib/actions/payments';

interface UsePaymentApprovalsReturn {
  pendingPayments: PaymentRecord[];
  allPayments: PaymentRecord[];
  loading: boolean;
  approving: boolean;
  rejecting: boolean;
  handleApprove: (paymentId: string) => Promise<{ success: boolean; error?: string }>;
  handleReject: (paymentId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  refreshPayments: () => Promise<void>;
}

export function usePaymentApprovals(): UsePaymentApprovalsReturn {
  const [pendingPayments, setPendingPayments] = useState<PaymentRecord[]>([]);
  const [allPayments, setAllPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  // Load data
  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const [pending, all] = await Promise.all([
        getAllPendingPayments(),
        getAllPaymentsAdmin(),
      ]);
      setPendingPayments(pending || []);
      setAllPayments(all || []);
    } catch (err) {
      console.error('[usePaymentApprovals] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up real-time listener for payments collection
  useEffect(() => {
    const q = query(
      collection(db, 'payments'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    unsubscribeRef.current = onSnapshot(q, (snap) => {
      const payments = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? doc.data().createdAt,
      })) as PaymentRecord[];

      // Update both pending and all
      setPendingPayments(payments.filter(p => p.status === 'PENDING' && p.createdByRole !== 'ACDEMA'));
      setAllPayments(payments);
    }, (err) => {
      console.error('[usePaymentApprovals] Real-time listener error:', err);
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Initial load
  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleApprove = useCallback(async (paymentId: string): Promise<{ success: boolean; error?: string }> => {
    setApproving(true);
    try {
      const res = await approvePayment(paymentId);
      if (res.success) {
        // Refresh to get latest state
        await loadPayments();
      }
      return res;
    } catch (err: any) {
      console.error('[usePaymentApprovals] Approve failed:', err);
      return { success: false, error: err.message || 'Failed to approve payment.' };
    } finally {
      setApproving(false);
    }
  }, [loadPayments]);

  const handleReject = useCallback(async (paymentId: string, reason: string): Promise<{ success: boolean; error?: string }> => {
    setRejecting(true);
    try {
      const res = await rejectPayment(paymentId, reason);
      if (res.success) {
        // Refresh to get latest state
        await loadPayments();
      }
      return res;
    } catch (err: any) {
      console.error('[usePaymentApprovals] Reject failed:', err);
      return { success: false, error: err.message || 'Failed to reject payment.' };
    } finally {
      setRejecting(false);
    }
  }, [loadPayments]);

  return {
    pendingPayments,
    allPayments,
    loading,
    approving,
    rejecting,
    handleApprove,
    handleReject,
    refreshPayments: loadPayments,
  };
}

