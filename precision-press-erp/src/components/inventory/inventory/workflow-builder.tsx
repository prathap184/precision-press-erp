'use client';

import React from 'react';
import { 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  Plus, 
  Activity
} from 'lucide-react';

export type StaffRole =
  | 'ACDEMA'
  | 'DESIGNER'
  | 'MANAGER'
  | 'PRINTER'
  | 'PASTING'
  | 'FINISHING'
  | 'DISPATCH'
  | 'DELIVERY'
  | 'ACCOUNTANT';

export const ROLE_META: Record<StaffRole, { label: string; color: string; bg: string }> = {
  ACDEMA:     { label: 'Acdema',     color: '#7c3aed', bg: '#ede9fe' },
  DESIGNER:   { label: 'Designer',   color: '#0891b2', bg: '#ecfeff' },
  MANAGER:    { label: 'Manager',    color: '#0284c7', bg: '#e0f2fe' },
  PRINTER:    { label: 'Printer',    color: '#ea580c', bg: '#fff7ed' },
  PASTING:    { label: 'Pasting',    color: '#d97706', bg: '#fef3c7' },
  FINISHING:  { label: 'Finishing',  color: '#059669', bg: '#d1fae5' },
  DISPATCH:   { label: 'Dispatch',   color: '#2563eb', bg: '#eff6ff' },
  DELIVERY:   { label: 'Delivery',   color: '#4f46e5', bg: '#e0e7ff' },
  ACCOUNTANT: { label: 'Accountant', color: '#dc2626', bg: '#fee2e2' },
};

export const ALL_STAFF_ROLES: StaffRole[] = Object.keys(ROLE_META) as StaffRole[];

export interface WorkflowStep {
  id: string;
  label: string;
  role: StaffRole;
  blocking: boolean;
}

interface WorkflowBuilderProps {
  steps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
}

export function WorkflowBuilder({ steps = [], onChange }: WorkflowBuilderProps) {
  
  const addStep = (role: StaffRole) => {
    const meta = ROLE_META[role];
    if (!meta) return; 
    const newStep: WorkflowStep = {
      id: Math.random().toString(36).substr(2, 9),
      label: meta.label,
      role: role,
      blocking: true
    };
    onChange([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    onChange(newSteps);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    onChange(newSteps);
  };

  const updateStepLabel = (index: number, label: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], label };
    onChange(newSteps);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-indigo-600" />
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Production Workflow Builder</h3>
        </div>
        <p className="text-[10px] font-bold text-slate-400 uppercase">Step-by-step sequential flow</p>
      </div>

      <div className="space-y-2">
        {steps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <p className="text-xs font-medium text-slate-400 italic">No workflow steps defined. Production will be manual.</p>
          </div>
        ) : (
          steps
            .filter(step => ROLE_META[step.role]) 
            .map((step, index) => {
            const meta = ROLE_META[step.role];
            if (!meta) return null; 
            return (
              <div 
                key={step.id}
                className="group flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-2xl shadow-sm hover:border-indigo-300 transition-all"
              >
                <div className="flex flex-col gap-1">
                  <button 
                    type="button"
                    onClick={() => moveStep(index, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-slate-100 rounded disabled:opacity-0 transition-all"
                  >
                    <ArrowUp size={12} className="text-slate-400" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => moveStep(index, 'down')}
                    disabled={index === steps.length - 1}
                    className="p-1 hover:bg-slate-100 rounded disabled:opacity-0 transition-all"
                  >
                    <ArrowDown size={12} className="text-slate-400" />
                  </button>
                </div>

                <div className="flex-1 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 shadow-inner">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 space-y-1">
                    <input 
                      type="text"
                      value={step.label}
                      onChange={(e) => updateStepLabel(index, e.target.value)}
                      className="w-full text-xs font-bold text-slate-800 bg-transparent border-none p-0 focus:ring-0 focus:outline-none"
                      placeholder="Step Label"
                    />
                    <div className="flex items-center gap-2">
                      <span 
                        className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter"
                        style={{ backgroundColor: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={() => removeStep(index)}
                  className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center mb-2">Available Operational Roles</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {ALL_STAFF_ROLES
            .map(role => {
              const meta = ROLE_META[role];
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => addStep(role)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm active:scale-95"
                >
                  <Plus size={10} />
                  {meta.label}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
