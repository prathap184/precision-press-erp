'use client';

import React, { useState } from 'react';
import { approveCustomerPaymentRequest, rejectCustomerPaymentRequest } from '@/lib/actions/payments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface PaymentRequest {
  id: string;
  userId: string;
  customerName: string;
  paymentMode: string;
  amount: number;
  status: RequestStatus;
  bankId?: string;
  depositDate?: string;
  utrNo?: string;
  chequeNo?: string;
  paymentProofLink?: string;
  remarks?: string;
  timestamp: string;
}

interface PaymentRequestsClientProps {
  initialRequests: PaymentRequest[];
}

export default function PaymentRequestsClient({ initialRequests }: PaymentRequestsClientProps) {
  const [requests, setRequests] = useState<PaymentRequest[]>(initialRequests);
  const [filter, setFilter] = useState<RequestStatus | 'ALL'>('PENDING');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const filteredRequests = requests.filter(req => filter === 'ALL' || req.status === filter);

  const handleApprove = async (id: string) => {
    if (!confirm('Are you sure you want to approve this request and add credit to the customer?')) return;
    
    setLoadingAction(id);
    const result = await approveCustomerPaymentRequest(id);
    setLoadingAction(null);

    if (result?.success) {
      toast.success('Payment request approved. Credit added.');
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'APPROVED' } : r));
    } else {
      toast.error(result?.error || 'Failed to approve request');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;
    
    setLoadingAction(id);
    const result = await rejectCustomerPaymentRequest(id, reason);
    setLoadingAction(null);

    if (result?.success) {
      toast.success('Payment request rejected.');
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'REJECTED' } : r));
    } else {
      toast.error(result?.error || 'Failed to reject request');
    }
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="p-0">
        <div className="flex border-b">
          {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab as RequestStatus | 'ALL')}
              className={`px-6 py-4 text-sm font-medium border-b-2 focus:outline-none ${
                filter === tab 
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                {requests.filter(r => tab === 'ALL' || r.status === tab).length}
              </span>
            </button>
          ))}
        </div>

        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No {filter !== 'ALL' ? filter.toLowerCase() : ''} payment requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Customer</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Amount</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Details</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Proof</th>
                  <th className="px-6 py-4 font-semibold text-gray-600">Status</th>
                  <th className="px-6 py-4 font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRequests.map(req => (
                  <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                      {new Date(req.timestamp).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {req.customerName}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      ₹{req.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate">
                      <div className="font-medium text-gray-700">{req.paymentMode.replace('_', ' ')}</div>
                      {req.utrNo && <div className="text-xs">UTR: {req.utrNo}</div>}
                      {req.chequeNo && <div className="text-xs">Cheque: {req.chequeNo}</div>}
                    </td>
                    <td className="px-6 py-4">
                      {req.paymentProofLink ? (
                        <a 
                          href={req.paymentProofLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-indigo-600 hover:text-indigo-900 font-medium bg-indigo-50 px-3 py-1.5 rounded-md hover:bg-indigo-100 transition-colors"
                        >
                          View Proof <ExternalLink className="ml-1 w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-gray-400 italic text-xs">No proof uploaded</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={
                        req.status === 'APPROVED' ? 'border-green-200 text-green-700 bg-green-50' :
                        req.status === 'REJECTED' ? 'border-red-200 text-red-700 bg-red-50' :
                        'border-yellow-200 text-yellow-700 bg-yellow-50'
                      }>
                        {req.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {req.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={loadingAction === req.id}
                            className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:text-green-800"
                            onClick={() => handleApprove(req.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={loadingAction === req.id}
                            className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:text-red-800"
                            onClick={() => handleReject(req.id)}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
