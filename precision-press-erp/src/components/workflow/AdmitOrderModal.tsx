'use client';

/**
 * AdmitOrderModal.tsx
 * ────────────────────
 * Admits a production order INTO a department's live queue.
 * This creates the first workflow_stage_history row for that order
 * in the current department.
 *
 * Two paths:
 *  1. Search existing orders (from the `orders` table)
 *  2. Quick admit — type an order ID manually (for walk-in / manual jobs)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { fetchAdmissibleOrders, enterDepartment, type WorkflowPriority } from '@/lib/workflow-transitions';
import { Search, Plus, X, Loader2, AlertTriangle, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface AdmitOrderModalProps {
  departmentId: string;
  departmentName: string;
  departmentColor: string;
  slaMinutes?: number;
  onSuccess: () => void;
  onClose: () => void;
}

type Mode = 'search' | 'manual';

const PRIORITIES: WorkflowPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const PRIORITY_COLORS: Record<WorkflowPriority, string> = {
  LOW:    'bg-slate-100 text-slate-600 border-slate-200',
  NORMAL: 'bg-blue-50 text-blue-700 border-blue-200',
  HIGH:   'bg-amber-50 text-amber-700 border-amber-200',
  URGENT: 'bg-red-50 text-red-700 border-red-200',
};

export default function AdmitOrderModal({
  departmentId,
  departmentName,
  departmentColor,
  slaMinutes,
  onSuccess,
  onClose,
}: AdmitOrderModalProps) {
  const [mode, setMode] = useState<Mode>('search');
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState<WorkflowPriority>('NORMAL');
  const [remarks, setRemarks] = useState('');
  const [manualOrderId, setManualOrderId] = useState('');
  const [manualCustomer, setManualCustomer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdmissibleOrders(departmentId)
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingOrders(false));
  }, [departmentId]);

  const filtered = orders.filter((o) =>
    !search ||
    o.id?.toLowerCase().includes(search.toLowerCase()) ||
    o.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    o.company?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSubmit() {
    setError('');

    if (mode === 'search' && !selectedOrder) {
      setError('Please select an order to admit.');
      return;
    }
    if (mode === 'manual' && !manualOrderId.trim()) {
      setError('Please enter an Order ID.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'search' && selectedOrder) {
        await enterDepartment({
          departmentId,
          departmentName,
          parentOrderId: selectedOrder.id,
          priority: (selectedOrder.priority as WorkflowPriority) || priority,
          slaTargetMinutes: slaMinutes,
          remarks,
          snapshot: {
            customerName: selectedOrder.customerName || selectedOrder.customer_snapshot?.name || '—',
            company: selectedOrder.company || selectedOrder.customer_snapshot?.displayName || '',
            orderType: selectedOrder.orderType || selectedOrder.order_type || '—',
            quantity: selectedOrder.quantity,
            status: selectedOrder.status,
          },
        });
      } else {
        // Manual quick-admit
        await enterDepartment({
          departmentId,
          departmentName,
          parentOrderId: manualOrderId.trim().toUpperCase(),
          priority,
          slaTargetMinutes: slaMinutes,
          remarks,
          snapshot: {
            customerName: manualCustomer.trim() || 'Unknown',
            manualEntry: true,
          },
        });
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = mode === 'search' ? !!selectedOrder : !!manualOrderId.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex-shrink-0" style={{ borderTopColor: departmentColor, borderTopWidth: 3 }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-800">Admit Order</h2>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                Add an order to <span className="font-black" style={{ color: departmentColor }}>{departmentName}</span> queue
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={16} className="text-slate-500" />
            </button>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 mt-4">
            {([
              { key: 'search' as Mode, label: 'From Orders' },
              { key: 'manual' as Mode, label: 'Quick Admit' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setMode(key); setError(''); setSelectedOrder(null); }}
                className={`px-4 py-1.5 text-[10px] font-black rounded-lg border transition-colors ${
                  mode === key ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-500'
                }`}
                style={mode === key ? { backgroundColor: departmentColor } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {mode === 'search' && (
            <>
              {/* Search box */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by order ID or customer..."
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 transition-all"
                  style={{ '--tw-ring-color': departmentColor } as any}
                />
              </div>

              {/* Order list */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {loadingOrders ? (
                  [...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
                  ))
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    <p>No eligible orders found.</p>
                    <p className="mt-1 text-[10px]">Orders must be in ASSIGNED, IN_PROGRESS, or similar production states.</p>
                  </div>
                ) : (
                  filtered.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        selectedOrder?.id === order.id
                          ? 'border-2 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                      style={selectedOrder?.id === order.id ? { borderColor: departmentColor, backgroundColor: `${departmentColor}0d` } : {}}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selectedOrder?.id === order.id ? 'border-transparent text-white' : 'border-slate-300'}`} style={selectedOrder?.id === order.id ? { backgroundColor: departmentColor } : {}}>
                        {selectedOrder?.id === order.id && <Check size={10} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-blue-600">{order.id}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${
                            order.priority === 'URGENT' ? 'bg-red-50 text-red-600 border-red-200' :
                            order.priority === 'HIGH' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                            'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>{order.priority || 'NORMAL'}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-700 truncate">{order.customerName || '—'}</p>
                        <p className="text-[10px] text-slate-400">{order.orderType || order.status}</p>
                      </div>
                      {order.quantity && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Qty {order.quantity}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Selected preview */}
              {selectedOrder && (
                <div className="p-3 rounded-xl border-2 text-xs" style={{ borderColor: departmentColor, backgroundColor: `${departmentColor}08` }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: departmentColor }}>Selected</p>
                  <p className="font-black text-slate-800">{selectedOrder.id}</p>
                  <p className="text-slate-600">{selectedOrder.customerName} · {selectedOrder.company}</p>
                </div>
              )}
            </>
          )}

          {mode === 'manual' && (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Order ID *</label>
                <input
                  type="text"
                  value={manualOrderId}
                  onChange={(e) => setManualOrderId(e.target.value)}
                  placeholder="e.g. PP-2024-001234"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:outline-none focus:ring-2 transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Customer Name</label>
                <input
                  type="text"
                  value={manualCustomer}
                  onChange={(e) => setManualCustomer(e.target.value)}
                  placeholder="Customer or company name"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 transition-all"
                />
              </div>
            </>
          )}

          {/* Priority selector (shared) */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Priority</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2 text-[10px] font-black rounded-lg border transition-colors ${
                    priority === p ? PRIORITY_COLORS[p] : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* SLA info */}
          {slaMinutes && (
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              SLA target for {departmentName}: <span className="font-black text-slate-600">{slaMinutes} min</span>
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any special instructions for this stage..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 transition-all"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium p-3 rounded-lg flex items-center gap-2">
              <AlertTriangle size={13} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-xs font-black text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="flex-1 py-2.5 text-xs font-black text-white rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: departmentColor }}
          >
            {submitting
              ? <><Loader2 size={13} className="animate-spin" /> Admitting...</>
              : <><Plus size={13} /> Admit to {departmentName}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
