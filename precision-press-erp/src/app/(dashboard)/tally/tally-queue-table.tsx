'use client';

import React, { useState } from 'react';
import { TallySyncEvent } from '@/types/tally';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Clock, RotateCcw, FileCode2 } from 'lucide-react';
import { retryTallySyncEvent } from '@/lib/actions/tally-sync';
import { format } from 'date-fns';

export function TallyQueueTable({ initialEvents }: { initialEvents: TallySyncEvent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleRetry = async (eventId: string) => {
    setRetrying(eventId);
    const res = await retryTallySyncEvent(eventId);
    if (res.success) {
      setEvents(prev => 
        prev.map(e => e.id === eventId ? { ...e, status: 'PENDING', retryCount: 0, lastError: undefined } : e)
      );
    }
    setRetrying(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1"/> Success</Badge>;
      case 'FAILED':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-200 border-red-200"><XCircle className="w-3 h-3 mr-1"/> Failed</Badge>;
      case 'IN_FLIGHT':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200"><Clock className="w-3 h-3 mr-1"/> Syncing...</Badge>;
      case 'PENDING':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200"><Clock className="w-3 h-3 mr-1"/> Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
          <tr>
            <th className="px-4 py-3">ID / Type</th>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Details / Errors</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                No Tally sync events found.
              </td>
            </tr>
          ) : (
            events.map((event) => (
              <tr key={event.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{event.syncType}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{event.id}</div>
                </td>
                <td className="px-4 py-3">
                  {event.orderId && <div>Order: <span className="font-mono text-slate-600">{event.orderId}</span></div>}
                  {event.paymentId && <div>Payment: <span className="font-mono text-slate-600">{event.paymentId}</span></div>}
                  {event.customerId && <div>Customer: <span className="font-mono text-slate-600">{event.customerId}</span></div>}
                  {!event.orderId && !event.paymentId && !event.customerId && <span className="text-slate-400">-</span>}
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(event.status)}
                  {event.status === 'FAILED' && (
                    <div className="text-xs text-slate-500 mt-1">Attempts: {event.retryCount}/{event.maxRetries}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                  {event.createdAt ? format(new Date(event.createdAt), 'MMM d, h:mm a') : '-'}
                </td>
                <td className="px-4 py-3 max-w-xs">
                  {event.lastError && (
                    <div className="text-red-600 text-xs truncate" title={event.lastError}>
                      {event.lastError}
                    </div>
                  )}
                  {event.tallyResponse?.status === 'Accepted' && (
                    <div className="text-emerald-600 text-xs truncate">
                      Accepted by TallyPrime
                    </div>
                  )}
                  {!event.lastError && event.status === 'PENDING' && (
                    <div className="text-slate-400 text-xs">Waiting for Connector...</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {event.status === 'FAILED' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRetry(event.id)}
                      disabled={retrying === event.id}
                      className="h-8 text-xs gap-1"
                    >
                      <RotateCcw className={`w-3 h-3 ${retrying === event.id ? 'animate-spin' : ''}`} />
                      Retry
                    </Button>
                  )}
                  {/* Detailed payload viewer could be added here later */}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
