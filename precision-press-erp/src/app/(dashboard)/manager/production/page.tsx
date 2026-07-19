'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { 
  Printer, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Zap,
  MoreVertical,
  Play,
  RotateCcw,
  CheckCheck,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { WorkflowTaskQueue } from '@/components/production/WorkflowTaskQueue';
import { StaffRole } from '@/types/roles';

const MACHINE_STATUS = [
  { name: 'Solvent 01', type: 'SOLVENT', utilization: 85, status: 'RUNNING' },
  { name: 'Eco-Solvent 04', type: 'ECO_SOLVENT', utilization: 12, status: 'IDLE' },
  { name: 'Fabric Prime', type: 'FABRIC', utilization: 0, status: 'OFFLINE' },
];

export default function ProductionPage() {
  const { profile } = useAuth();

  const productionRoles: StaffRole[] = [
    'DESIGNER', 
    'PRINTER', 
    'DISPATCH', 
    'DELIVERY'
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Machine Pulse Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {MACHINE_STATUS.map((m, i) => (
          <div key={i} className="bg-surface-container-lowest p-6 rounded-2xl relative overflow-hidden group">
            <div className="flex justify-between items-center mb-6 relative z-10">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  m.status === 'RUNNING' ? 'bg-secondary animate-pulse' : 
                  m.status === 'IDLE' ? 'bg-amber-400' : 'bg-on-surface-variant/30'
                }`} />
                <h3 className="font-bold text-primary font-display">{m.name}</h3>
              </div>
              <span className="text-[10px] font-bold text-on-surface-variant/40 tracking-widest">{m.type}</span>
            </div>
            
            <div className="mb-4 relative z-10">
              <div className="flex justify-between text-xs font-bold text-primary mb-2">
                <span>Utilization</span>
                <span>{m.utilization}%</span>
              </div>
              <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    m.utilization > 80 ? 'bg-red-500' : 'bg-secondary'
                  }`}
                  style={{ width: `${m.utilization}%` }}
                />
              </div>
            </div>

            <div className="absolute right-[-20%] bottom-[-20%] opacity-[0.03] text-primary group-hover:rotate-12 transition-transform duration-700">
              <Printer size={160} strokeWidth={1} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Workflow Monitor */}
      <WorkflowTaskQueue 
        role={productionRoles as any}
        title="Global Production Monitor"
        icon={<Zap className="w-6 h-6" />}
      />
    </div>
  );
}
