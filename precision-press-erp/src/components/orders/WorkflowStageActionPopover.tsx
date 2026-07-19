'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, serverTimestamp } from '@/lib/supabase-firestore-shim';
import { useAuth } from '@/lib/auth-context';
import {
  Play, CheckCircle2, PauseCircle, Loader2, ChevronDown,
  Zap, ClipboardCheck, Clock, X
} from 'lucide-react';
import { OrderWorkflowStep, OrderWorkflowSnapshot } from '@/types/workflow';

interface WorkflowStageActionPopoverProps {
  orderId: string;
  stepIndex: number;           // original index in snapshot.steps
  step: OrderWorkflowStep;
  snapshot: OrderWorkflowSnapshot;
  children: React.ReactNode;   // the stage pill / dot trigger element
}

type ActionType = 'START' | 'COMPLETE' | 'HOLD';

const ACTION_META: Record<ActionType, {
  label: string;
  description: string;
  icon: React.ReactNode;
  buttonClass: string;
  nextStatus: OrderWorkflowStep['status'];
}> = {
  START: {
    label: 'Accept & Start',
    description: 'Mark this stage as In Progress',
    icon: <Play size={11} className="fill-current" />,
    buttonClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    nextStatus: 'IN_PROGRESS',
  },
  COMPLETE: {
    label: 'Mark Complete',
    description: 'Advance to next stage',
    icon: <CheckCircle2 size={11} />,
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    nextStatus: 'COMPLETED',
  },
  HOLD: {
    label: 'Put On Hold',
    description: 'Pause this stage temporarily',
    icon: <PauseCircle size={11} />,
    buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
    nextStatus: 'ON_HOLD',
  },
};

/** Returns which actions are available given the step's current status */
function getAvailableActions(status: OrderWorkflowStep['status']): ActionType[] {
  switch (status) {
    case 'PENDING':      return ['START'];
    case 'IN_PROGRESS':  return ['COMPLETE', 'HOLD'];
    case 'ON_HOLD':      return ['START']; // resume = START
    default:             return [];
  }
}

export function WorkflowStageActionPopover({
  orderId,
  stepIndex,
  step,
  snapshot,
  children,
}: WorkflowStageActionPopoverProps) {
  const { user, role, roles } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const availableActions = getAvailableActions(step.status);
  // Merge effective roles: when a user has ACDEMA, include ACDEMA's default staff roles
  const DEFAULT_ACDEMA_ROLES: typeof step.role[] = ['ACCOUNTANT', 'DESIGNER', 'MANAGER'] as any;
  const effectiveRolesSet = new Set<string>(roles || []);
  if (roles?.includes('ACDEMA' as any)) {
    DEFAULT_ACDEMA_ROLES.forEach(r => effectiveRolesSet.add(r));
  }
  const effectiveRoles = Array.from(effectiveRolesSet) as string[];

  const isMyStep = effectiveRoles.includes(step.role) || role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isCurrentStep = stepIndex === snapshot.currentStepIndex;
  const canAct = isMyStep && isCurrentStep && availableActions.length > 0;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDone(null);
        setNote('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleAction = async (actionType: ActionType) => {
    if (busy || !user) return;
    setBusy(true);

    try {
      const orderRef = doc(db, 'orders', orderId);
      const meta = ACTION_META[actionType];
      const now = serverTimestamp();

      // Build updated steps array
      const updatedSteps = snapshot.steps.map((s, i) => {
        if (i !== stepIndex) return s;
        const historyEntry = {
          status: meta.nextStatus,
          timestamp: new Date().toISOString(),
          by: user.uid,
          note: note.trim() || `${meta.label} via Global Registry`,
        };
        return {
          ...s,
          status: meta.nextStatus,
          ...(actionType === 'START' ? { startedAt: now } : {}),
          ...(actionType === 'COMPLETE' ? { completedAt: now, completedBy: user.uid } : {}),
          history: [...(s.history || []), historyEntry],
        };
      });

      // If completing, advance the pointer to next step
      let nextStepIndex = snapshot.currentStepIndex;
      let nextRole: string | null = null;
      let nextLabel: string | null = null;

      if (actionType === 'COMPLETE') {
        const nextIdx = stepIndex + 1;
        if (nextIdx < snapshot.steps.length) {
          nextStepIndex = nextIdx;
          const nextStep = updatedSteps[nextIdx];
          nextRole = nextStep.role;
          nextLabel = nextStep.label;
          // Unlock next step
          updatedSteps[nextIdx] = { ...updatedSteps[nextIdx], status: 'PENDING' };
        }
      }

      const updatePayload: Record<string, any> = {
        'workflowSnapshot.steps': updatedSteps,
        'workflowSnapshot.currentStepIndex': nextStepIndex,
        updatedAt: now,
      };

      if (actionType === 'COMPLETE' && nextRole) {
        updatePayload['currentWorkflowRole'] = nextRole;
        updatePayload['currentWorkflowLabel'] = nextLabel;
      }

      await updateDoc(orderRef, updatePayload);

      setDone(meta.label);
      setTimeout(() => {
        setOpen(false);
        setDone(null);
        setNote('');
      }, 1400);
    } catch (err) {
      console.error('Stage action failed:', err);
    } finally {
      setBusy(false);
    }
  };

  // If no actions possible, just render trigger without popover
  if (!canAct) {
    return <>{children}</>;
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      {/* Trigger: the existing stage pill, plus a tiny indicator dot */}
      <div
        className="flex items-center cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
        title={`Click to act on ${step.label}`}
      >
        {children}
        <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
      </div>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-0 mb-2 z-[999] w-56 shadow-xl"
          style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.18))' }}
        >
          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-3 w-3 h-3 bg-slate-900 rotate-45 z-0" />

          <div className="relative bg-slate-900 rounded-xl overflow-hidden border border-slate-700 z-10">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60">
              <div className="flex items-center gap-1.5">
                <Zap size={10} className="text-indigo-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-300">
                  {step.label}
                </span>
              </div>
              <button
                onClick={() => { setOpen(false); setDone(null); setNote(''); }}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={10} />
              </button>
            </div>

            {done ? (
              /* Success state */
              <div className="flex flex-col items-center justify-center gap-2 py-5">
                <CheckCircle2 size={20} className="text-emerald-400" />
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{done}</p>
              </div>
            ) : (
              <div className="p-2.5 space-y-2">
                {/* Current status badge */}
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  <Clock size={9} />
                  <span>{step.status.replace(/_/g, ' ')}</span>
                </div>

                {/* Optional note */}
                <input
                  type="text"
                  placeholder="Add a note (optional)..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full bg-white/5 border border-slate-700 rounded px-2 py-1.5 text-[9px] text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500 transition-colors font-medium"
                  maxLength={120}
                />

                {/* Action buttons */}
                <div className="flex flex-col gap-1.5">
                  {availableActions.map(actionType => {
                    const meta = ACTION_META[actionType];
                    return (
                      <button
                        key={actionType}
                        onClick={() => handleAction(actionType)}
                        disabled={busy}
                        className={`flex items-center justify-between w-full px-2.5 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-60 ${meta.buttonClass}`}
                      >
                        <span className="flex items-center gap-1.5">
                          {busy ? <Loader2 size={10} className="animate-spin" /> : meta.icon}
                          {meta.label}
                        </span>
                        <ChevronDown size={9} className="-rotate-90 opacity-60" />
                      </button>
                    );
                  })}
                </div>

                <p className="text-[8px] text-slate-600 font-medium leading-tight px-0.5">
                  Actions are logged with your user identity and timestamp.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

