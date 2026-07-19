'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, X } from 'lucide-react';

interface OrderLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
}

export function OrderLedgerModal({ isOpen, onClose, orderId }: OrderLedgerModalProps) {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !orderId) return;

    let mounted = true;
    const fetchLedger = async () => {
      setLoading(true);
      try {
        // Fetch order to get account name and dispatch method
        const { data: orderData } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();
        
        if (orderData && mounted) {
          setOrder(orderData);
        }

        // Fetch activity logs
        const { data: logsList } = await supabase
          .from('activity_logs')
          .select('*')
          .or(`meta->>orderId.eq.${orderId}`);
        
        if (logsList && mounted) {
          const sortedLogs = [...logsList].sort((a: any, b: any) => {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          });
          setLogs(sortedLogs);
        }
      } catch (err) {
        console.error('Failed to fetch ledger:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchLedger();

    return () => {
      mounted = false;
    };
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  const dispatchMethod = order?.delivery?.choice || order?.dispatchInfo?.method || 'N/A';
  const customerName = order?.customerSnapshot?.displayName || order?.customerSnapshot?.name || 'Unknown Account';
  
  const formatLogDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(new Date(dateStr));
    } catch {
      return '—';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest italic">
              Ledger Journal & Activity Stream
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/50 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <X size={16} strokeWidth={3} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 p-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Journal...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Account Info Bar */}
            <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center gap-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Name:</span>
              <span className="text-sm font-black text-slate-900 uppercase">{customerName}</span>
            </div>

            <div className="grid grid-cols-5 text-[10px] font-black text-slate-400 uppercase tracking-widest p-6 border-b border-slate-100 bg-slate-50/30 sticky top-0 backdrop-blur-md">
              <div>Order Status</div>
              <div>Delivery Choice</div>
              <div>Updated By</div>
              <div>Verified On</div>
              <div>Remarks</div>
            </div>
            
            <div className="divide-y divide-slate-100 pb-10">
              {logs.length > 0 ? (
                logs.map((log, idx) => (
                  <div key={idx} className="grid grid-cols-5 items-center p-6 text-sm hover:bg-slate-50/30 transition-colors">
                    <div className="tabular-nums">
                      <span className="px-3 py-1 bg-slate-100 text-slate-900 text-[9px] font-black uppercase tracking-widest rounded-full">
                        {log.meta?.nextStatus || log.action || 'Event Logged'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-400 tabular-nums uppercase">
                      {dispatchMethod || 'N/A'}
                    </div>
                    <div className="tabular-nums flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-black shrink-0">
                        {log.userRole?.charAt(0) || 'U'}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                        {log.userRole || 'USER'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-500 tabular-nums">
                      {formatLogDate(log.timestamp)}
                    </div>
                    <div className="text-[10px] font-black text-slate-400 italic tracking-tighter tabular-nums truncate pr-4">
                      {log.meta?.remarks || '—'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center flex items-center justify-center">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic">
                    Initial capture complete. Log stream active.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
