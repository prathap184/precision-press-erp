'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow, format, differenceInMinutes } from 'date-fns';
import { Clock, CheckCircle2, Circle, AlertCircle } from 'lucide-react';

interface WorkflowTimelineProps {
  orderId: string;
}

export function WorkflowTimeline({ orderId }: WorkflowTimelineProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [departments, setDepartments] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchData() {
      try {
        setLoading(true);
        // Fetch history
        const { data: historyData, error: historyError } = await supabase
          .from('workflow_stage_history')
          .select('*')
          .eq('parent_order_id', orderId)
          .order('entered_at', { ascending: true });

        if (historyError) throw historyError;

        // Fetch departments for metadata (icons, colors)
        const { data: deptData, error: deptError } = await supabase
          .from('workflow_departments')
          .select('*');

        if (deptError) throw deptError;

        const deptMap = (deptData || []).reduce((acc: any, d: any) => {
          acc[d.id] = d;
          return acc;
        }, {});

        if (active) {
          setHistory(historyData || []);
          setDepartments(deptMap);
        }
      } catch (err) {
        console.error('Failed to load workflow timeline:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchData();
    return () => { active = false; };
  }, [orderId]);

  if (loading) {
    return <div className="p-4 text-center text-slate-500 animate-pulse text-xs">Loading timeline...</div>;
  }

  if (history.length === 0) {
    return <div className="p-4 text-center text-slate-400 text-xs italic">No workflow history found for this order.</div>;
  }

  return (
    <div className="w-full">
      <h3 className="text-[10px] font-black tracking-[0.15em] text-slate-500 uppercase mb-4">Production Timeline</h3>
      <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 pb-2">
        {history.map((entry, index) => {
          const isLast = index === history.length - 1;
          const isActive = !entry.exited_at;
          const dept = entry.department_id ? departments[entry.department_id] : null;
          
          let durationStr = '—';
          let overSla = false;

          if (entry.exited_at) {
            const mins = entry.duration_minutes || differenceInMinutes(new Date(entry.exited_at), new Date(entry.entered_at));
            durationStr = `${Math.floor(mins / 60)}h ${mins % 60}m`;
            if (entry.sla_target_minutes && mins > entry.sla_target_minutes) overSla = true;
          } else {
            const mins = differenceInMinutes(new Date(), new Date(entry.entered_at));
            durationStr = `${Math.floor(mins / 60)}h ${mins % 60}m (ongoing)`;
            if (entry.sla_target_minutes && mins > entry.sla_target_minutes) overSla = true;
          }

          const stageName = dept ? dept.name : entry.workflow_stage;
          const dotColor = isActive ? 'text-blue-500 bg-white' : 'text-slate-400 bg-slate-50';

          return (
            <div key={entry.id} className="relative pl-6">
              {/* Timeline Dot */}
              <div className={`absolute -left-[9px] top-1 p-0.5 rounded-full ${dotColor}`}>
                {isActive ? (
                  <Circle size={14} className="fill-blue-500 text-blue-500 animate-pulse" />
                ) : (
                  <CheckCircle2 size={14} className="text-slate-400" />
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow transition-shadow">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                      {stageName}
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                      {entry.workflow_status}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400">
                      {format(new Date(entry.entered_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <Clock size={12} className={overSla ? 'text-red-500' : 'text-slate-400'} />
                    <span className={overSla ? 'text-red-600 font-bold' : ''}>{durationStr}</span>
                    {entry.sla_target_minutes && (
                      <span className="text-slate-400 ml-1">(SLA: {Math.floor(entry.sla_target_minutes/60)}h {entry.sla_target_minutes%60}m)</span>
                    )}
                  </div>
                  
                  {overSla && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-red-500 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded">
                      <AlertCircle size={10} /> SLA Breached
                    </div>
                  )}
                </div>

                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                  <div className="mt-2 bg-slate-50 rounded p-2 text-[10px] text-slate-600 border border-slate-100 overflow-hidden">
                    <pre className="font-mono text-[9px]">{JSON.stringify(entry.metadata, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
