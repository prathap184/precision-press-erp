'use client';

/**
 * TransitionModal.tsx
 * ────────────────────
 * Move an order from the current department to another department,
 * or mark it as "Completed" (exit without entering a new stage).
 *
 * Usage:
 *   <TransitionModal
 *     historyRow={row}           // The open workflow_stage_history row
 *     currentDepartmentId={id}
 *     currentDepartmentName="Printer"
 *     departmentColor="#3b82f6"
 *     onSuccess={() => reload()}
 *     onClose={() => setOpen(false)}
 *   />
 */

import React, { useEffect, useState } from 'react';
import {
  fetchAllDepartments,
  moveToDepartment,
  completeStage,
  removeFromWorkflow,
  type WorkflowPriority,
} from '@/lib/workflow-transitions';
import {
  ArrowRight, CheckCircle2, X, AlertTriangle, Clock,
  ChevronDown, Loader2, Trash2
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransitionModalProps {
  historyRow: any;                  // The open workflow_stage_history row
  currentDepartmentName: string;
  departmentColor: string;
  onSuccess: () => void;
  onClose: () => void;
}

type Mode = 'move' | 'complete' | 'remove';

const PRIORITIES: WorkflowPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const PRIORITY_COLORS: Record<WorkflowPriority, string> = {
  LOW:    'bg-slate-100 text-slate-600 border-slate-200',
  NORMAL: 'bg-blue-50 text-blue-700 border-blue-200',
  HIGH:   'bg-amber-50 text-amber-700 border-amber-200',
  URGENT: 'bg-red-50 text-red-700 border-red-200',
};

function formatElapsed(enteredAt: string): string {
  const ms = Date.now() - new Date(enteredAt).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransitionModal({
  historyRow,
  currentDepartmentName,
  departmentColor,
  onSuccess,
  onClose,
}: TransitionModalProps) {
  const [mode, setMode] = useState<Mode>('move');
  const [departments, setDepartments] = useState<any[]>([]);
  const [targetDeptId, setTargetDeptId] = useState('');
  const [priority, setPriority] = useState<WorkflowPriority>((historyRow?.priority as WorkflowPriority) || 'NORMAL');
  const [remarks, setRemarks] = useState('');
  const [exitRemarks, setExitRemarks] = useState('');
  const [isRework, setIsRework] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingDepts, setLoadingDepts] = useState(true);

  useEffect(() => {
    fetchAllDepartments()
      .then((depts) => {
        // Exclude the current department
        setDepartments(depts.filter((d: any) => d.id !== historyRow?.department_id));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingDepts(false));
  }, [historyRow?.department_id]);

  const targetDept = departments.find((d) => d.id === targetDeptId);

  async function handleSubmit() {
    setError('');

    if (mode === 'move' && !targetDeptId) {
      setError('Please select a target department.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'move') {
        await moveToDepartment({
          currentHistoryId: historyRow.id,
          targetDepartmentId: targetDeptId,
          targetDepartmentName: targetDept?.name || '',
          parentOrderId: historyRow.parent_order_id,
          childOrderId: historyRow.child_order_id,
          priority,
          slaTargetMinutes: targetDept?.sla_minutes || historyRow.sla_target_minutes,
          remarks,
          exitRemarks: exitRemarks || `Moved to ${targetDept?.name}`,
          snapshot: historyRow.snapshot,
        });
      } else if (mode === 'complete') {
        await completeStage({
          historyId: historyRow.id,
          remarks,
          isRework,
        });
      } else if (mode === 'remove') {
        await removeFromWorkflow(historyRow.id);
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const elapsed = historyRow?.entered_at ? formatElapsed(historyRow.entered_at) : '—';
  const sla = historyRow?.sla_target_minutes;
  const elapsedMin = historyRow?.entered_at ? Math.floor((Date.now() - new Date(historyRow.entered_at).getTime()) / 60000) : 0;
  const isOverdue = sla && elapsedMin > sla;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200" style={{ borderTopColor: departmentColor, borderTopWidth: 3 }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-800">Order Action</h2>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {historyRow?.parent_order_id} · {currentDepartmentName}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={16} className="text-slate-500" />
            </button>
          </div>

          {/* Order info strip */}
          <div className="flex items-center gap-4 mt-4 p-3 bg-slate-50 rounded-xl text-xs">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Customer</p>
              <p className="font-bold text-slate-700 mt-0.5">{historyRow?.snapshot?.customerName || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Waiting</p>
              <p className={`font-black mt-0.5 ${isOverdue ? 'text-red-600' : 'text-slate-700'}`}>
                {elapsed}
              </p>
            </div>
            {sla && (
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">SLA</p>
                <p className={`font-bold mt-0.5 ${isOverdue ? 'text-red-500' : 'text-green-600'}`}>
                  {isOverdue ? '⚠ Overdue' : 'On track'}
                </p>
              </div>
            )}
            <span className={`ml-auto text-[10px] font-black px-2 py-1 rounded-full ${PRIORITY_COLORS[historyRow?.priority || 'NORMAL']}`}>
              {historyRow?.priority || 'NORMAL'}
            </span>
          </div>
        </div>

        {/* Mode selector tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {([
            { key: 'move', label: 'Move to Dept', icon: ArrowRight },
            { key: 'complete', label: 'Mark Complete', icon: CheckCircle2 },
            { key: 'remove', label: 'Remove', icon: Trash2 },
          ] as { key: Mode; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setError(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-black transition-colors border-b-2 ${
                mode === key
                  ? 'border-b-2 text-slate-800 bg-white'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
              style={mode === key ? { borderBottomColor: departmentColor } : {}}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Form body */}
        <div className="px-6 py-5 space-y-4">
          {/* MOVE MODE */}
          {mode === 'move' && (
            <>
              {/* Target dept */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                  Move To Department *
                </label>
                {loadingDepts ? (
                  <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {departments.map((dept) => (
                      <button
                        key={dept.id}
                        onClick={() => setTargetDeptId(dept.id)}
                        className={`flex items-center gap-2 p-3 rounded-xl border text-left text-xs font-bold transition-all ${
                          targetDeptId === dept.id
                            ? 'border-2 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                        style={targetDeptId === dept.id ? { borderColor: dept.color, backgroundColor: `${dept.color}10` } : {}}
                      >
                        <span className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-black flex-shrink-0" style={{ backgroundColor: dept.color }}>
                          {dept.name[0]}
                        </span>
                        <div>
                          <p className="text-slate-800 leading-tight">{dept.name}</p>
                          {dept.sla_minutes && (
                            <p className="text-[9px] text-slate-400 font-medium">SLA {dept.sla_minutes}m</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority for next dept */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Priority in Next Department</label>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-1.5 text-[10px] font-black rounded-lg border transition-colors ${
                        priority === p ? PRIORITY_COLORS[p] + ' border' : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exit remarks */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Exit Note (current dept)</label>
                <input
                  type="text"
                  value={exitRemarks}
                  onChange={(e) => setExitRemarks(e.target.value)}
                  placeholder={`e.g. "Print complete, sending to Finishing"`}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                />
              </div>

              {/* Entry remarks */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Entry Note (next dept)</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Special handling required"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                />
              </div>
            </>
          )}

          {/* COMPLETE MODE */}
          {mode === 'complete' && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-green-800">Mark as Completed</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    This closes the order in <strong>{currentDepartmentName}</strong> without moving it to another department.
                    Duration and SLA status will be recorded automatically.
                  </p>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">Completion Remarks</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional notes about this completion..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-200 transition-all resize-none"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  onClick={() => setIsRework(!isRework)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${isRework ? 'bg-amber-500' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isRework ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-xs font-bold text-slate-700">Mark as Rework</span>
                <span className="text-[10px] text-slate-400">(flagged for QC review)</span>
              </label>
            </>
          )}

          {/* REMOVE MODE */}
          {mode === 'remove' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-800">Remove from Workflow</p>
                <p className="text-xs text-red-600 mt-1">
                  This will pull <strong>{historyRow?.parent_order_id}</strong> out of <strong>{currentDepartmentName}</strong>.
                  The stage history row will be closed with the current elapsed time.
                  This action cannot be undone.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium p-3 rounded-lg flex items-center gap-2">
              <AlertTriangle size={13} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-black text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (mode === 'move' && !targetDeptId)}
            className={`flex-1 py-2.5 text-xs font-black text-white rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2 ${
              mode === 'remove' ? 'bg-red-600 hover:bg-red-700' : ''
            }`}
            style={mode !== 'remove' ? { backgroundColor: departmentColor } : {}}
          >
            {submitting
              ? <><Loader2 size={13} className="animate-spin" /> Processing...</>
              : mode === 'move'
              ? <><ArrowRight size={13} /> Move to {targetDept?.name || 'Department'}</>
              : mode === 'complete'
              ? <><CheckCircle2 size={13} /> Mark Complete</>
              : <><Trash2 size={13} /> Confirm Remove</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
