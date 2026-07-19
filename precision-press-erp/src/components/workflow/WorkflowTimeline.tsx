'use client';

/**
 * WorkflowTimeline.tsx
 * ─────────────────────
 * Shows the complete production journey of an order across departments.
 * Fetches from workflow_stage_history ordered by entered_at.
 * Designed to be embedded inside any order detail page.
 *
 * Usage:
 *   <WorkflowTimeline orderId="PP-2024-001234" />
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Clock, CheckCircle2, AlertTriangle, Activity,
  ArrowRight, RefreshCw, Info
} from 'lucide-react';

interface WorkflowTimelineProps {
  orderId: string;
  compact?: boolean;   // if true, shows a condensed version
}

function formatDuration(mins: number | null | undefined): string {
  if (!mins && mins !== 0) return '—';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function formatElapsed(enteredAt: string): string {
  const min = Math.floor((Date.now() - new Date(enteredAt).getTime()) / 60000);
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
}

export default function WorkflowTimeline({ orderId, compact = false }: WorkflowTimelineProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('workflow_stage_history')
        .select('*')
        .eq('parent_order_id', orderId)
        .order('entered_at', { ascending: true });
      if (err) throw err;
      setRows(data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orderId]); // eslint-disable-line

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm p-4 bg-red-50 rounded-xl border border-red-200">
        <AlertTriangle size={14} /> {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Activity size={28} className="text-slate-200" />
        <p className="text-slate-400 text-sm font-medium">No workflow history yet</p>
        <p className="text-slate-300 text-xs">This order hasn't been admitted to any department.</p>
      </div>
    );
  }

  if (compact) {
    // Horizontal pill chain — fits inside a sidebar or order card
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {rows.map((row, idx) => {
          const isClosed = !!row.exited_at;
          const isLast = idx === rows.length - 1;
          return (
            <React.Fragment key={row.id}>
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border transition-all ${
                  isClosed
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'text-white border-transparent shadow-sm'
                }`}
                style={!isClosed ? { backgroundColor: row.snapshot?.color || '#3b82f6' } : {}}
                title={`${row.department_name} · ${isClosed ? `${row.duration_minutes}m` : 'In progress'}`}
              >
                {isClosed ? <CheckCircle2 size={9} /> : <Clock size={9} className="animate-pulse" />}
                {row.department_name}
                {isClosed && row.sla_status === 'BREACHED' && <AlertTriangle size={9} className="text-red-500" />}
              </div>
              {!isLast && <ArrowRight size={10} className="text-slate-300 flex-shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // Full timeline view
  const totalDuration = rows
    .filter((r) => r.duration_minutes)
    .reduce((sum: number, r: any) => sum + r.duration_minutes, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-slate-500" />
          <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Production Journey</span>
          <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">{rows.length} stages</span>
        </div>
        <div className="flex items-center gap-3">
          {totalDuration > 0 && (
            <span className="text-[10px] text-slate-400 font-medium">Total: {formatDuration(totalDuration)}</span>
          )}
          <button onClick={load} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <RefreshCw size={12} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical spine */}
        <div className="absolute left-4 top-4 bottom-4 w-px bg-slate-200" />

        <div className="space-y-3">
          {rows.map((row, idx) => {
            const isClosed = !!row.exited_at;
            const isActive = !isClosed;
            const isBreached = row.sla_status === 'BREACHED';
            const isMet = row.sla_status === 'MET';
            const deptColor = row.snapshot?.color || '#3b82f6';

            return (
              <div key={row.id} className="relative pl-10">
                {/* Dot */}
                <div
                  className={`absolute left-0 top-3.5 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm border-2 border-white z-10 ${
                    isActive ? 'text-white' : 'bg-green-50 text-green-700 border-green-200'
                  }`}
                  style={isActive ? { backgroundColor: deptColor } : {}}
                >
                  {isActive
                    ? <span className="animate-pulse">▶</span>
                    : <CheckCircle2 size={14} className="text-green-600" />
                  }
                </div>

                {/* Card */}
                <div className={`bg-white border rounded-xl p-4 shadow-sm ${
                  isActive ? 'border-2' : 'border-slate-200'
                } ${isBreached ? 'border-red-200' : ''}`}
                  style={isActive && !isBreached ? { borderColor: deptColor } : {}}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-800">{row.department_name}</span>

                      {/* Status badges */}
                      {isActive && (
                        <span className="text-[10px] font-black text-white px-2 py-0.5 rounded-full animate-pulse" style={{ backgroundColor: deptColor }}>
                          In Progress
                        </span>
                      )}
                      {isMet && (
                        <span className="text-[10px] font-black text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                          ✓ Met SLA
                        </span>
                      )}
                      {isBreached && (
                        <span className="text-[10px] font-black text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
                          <AlertTriangle size={9} /> SLA Breached
                        </span>
                      )}
                      {row.priority && row.priority !== 'NORMAL' && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          row.priority === 'URGENT' ? 'bg-red-50 text-red-700 border-red-200' :
                          row.priority === 'HIGH' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>{row.priority}</span>
                      )}
                      {row.is_rework && (
                        <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Rework</span>
                      )}
                    </div>

                    {/* Duration */}
                    <div className="text-right flex-shrink-0">
                      {isClosed ? (
                        <p className="text-sm font-black text-slate-700">{formatDuration(row.duration_minutes)}</p>
                      ) : (
                        <p className="text-sm font-black text-slate-700">{formatElapsed(row.entered_at)}</p>
                      )}
                      {row.sla_target_minutes && (
                        <p className="text-[10px] text-slate-400 font-medium">SLA: {formatDuration(row.sla_target_minutes)}</p>
                      )}
                    </div>
                  </div>

                  {/* Time details */}
                  <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400 font-medium flex-wrap">
                    <span>
                      <span className="font-bold text-slate-500">In: </span>
                      {formatDate(row.entered_at)}
                    </span>
                    {row.exited_at && (
                      <span>
                        <span className="font-bold text-slate-500">Out: </span>
                        {formatDate(row.exited_at)}
                      </span>
                    )}
                    {row.operator_name && (
                      <span>
                        <span className="font-bold text-slate-500">By: </span>
                        {row.operator_name}
                      </span>
                    )}
                  </div>

                  {/* Remarks */}
                  {row.remarks && (
                    <div className="flex items-start gap-1.5 mt-2 text-[10px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                      <Info size={10} className="mt-0.5 flex-shrink-0" />
                      {row.remarks}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
