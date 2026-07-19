import React from 'react';
import { adminDb } from '@/lib/firebase-admin';
import PaymentRequestsClient from './PaymentRequestsClient';

export const dynamic = 'force-dynamic';

export default async function AdminPaymentRequestsPage() {
  // Fetch only GENERAL payments
  const paymentsQuery = await adminDb
    .collection('payments')
    .where('orderId', '==', 'GENERAL')
    .orderBy('timestamp', 'desc')
    .get();

  const requests = paymentsQuery.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      customerName: data.customerName || 'Unknown Customer',
      paymentMode: data.paymentMode || 'BANK_TRANSFER',
      amount: data.amount || 0,
      status: data.status || 'PENDING',
      bankId: data.bankId || '',
      depositDate: data.depositDate || '',
      utrNo: data.depositRefNo || data.utrNo || '',
      chequeNo: data.chequeNo || '',
      paymentProofLink: data.proofDriveLink || data.paymentProofLink || '',
      remarks: data.remarks || '',
      timestamp: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() 
                 : (typeof data.createdAt === 'string' ? new Date(data.createdAt).toISOString() 
                 : (data.timestamp?.toDate ? data.timestamp.toDate().toISOString() 
                 : (typeof data.timestamp === 'string' ? new Date(data.timestamp).toISOString() 
                 : new Date().toISOString())))
    };
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Payment Requests</h1>
        <p className="text-sm text-gray-500 mt-1">Review and approve credit requests submitted by customers.</p>
      </div>

      <PaymentRequestsClient initialRequests={requests} />
    </div>
  );
}
