'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWorkflowHomeSummary, type DeptSummary } from '@/lib/workflow-analytics';
import { RoleGuard } from '@/lib/role-guard';
import {
  Layers, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  RefreshCw, Activity, ChevronRight
} from 'lucide-react';

const HEALTH_CONFIG = {
  good:     { label: 'Healthy',  dot: 'bg-green-400',  badge: 'bg-green-50 text-green-700 border-green-200',  ring: 'hover:border-green-200' },
  warning:  { label: 'Warning',  dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200',  ring: 'hover:border-amber-200' },
  critical: { label: 'Critical', dot: 'bg-red-400 animate-pulse', badge: 'bg-red-50 text-red-700 border-red-200', ring: 'hover:border-red-200 border-red-100' },
};

function HealthBadge({ health }: { health: DeptSummary['health'] }) {
  const cfg = HEALTH_CONFIG[health];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function DeptCard({ dept }: { dept: DeptSummary }) {
  const cfg = HEALTH_CONFIG[dept.health];
  const queuePct = dept.maxQueue > 0 ? Math.min(100, Math.round((dept.activeCount / dept.maxQueue) * 100)) : 0;

  return (
    <Link href={`/admin/workflow/${dept.id}`}>
      <div
        className={`group bg-white border rounded-2xl p-5 transition-all duration-200 hover:shadow-lg cursor-pointer h-full flex flex-col gap-4 relative overflow-hidden ${cfg.ring} border-slate-200`}
      >
        {/* Top color accent line */}
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ backgroundColor: dept.color }} />

        {/* Header */}
        <div className="flex items-start justify-between pt-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black shadow-sm" style={{ backgroundColor: dept.color }}>
              {dept.name[0]}
            </div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-tight">{dept.name}</h3>
          </div>
          <HealthBadge health={dept.health} />
        </div>

        {/* Main stat */}
        <div className="flex items-end gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Active</p>
            <p className="text-4xl font-black tracking-tighter leading-none" style={{ color: dept.color }}>
              {dept.activeCount}
            </p>
          </div>
          <div className="flex flex-col gap-1 mb-0.5 ml-auto text-right">
            <div className="flex items-center gap-1 text-[10px] font-bold text-green-600">
              <CheckCircle2 size={10} />
              {dept.completedToday} today
            </div>
            {dept.overdueCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-red-500">
                <AlertTriangle size={10} />
                {dept.overdueCount} overdue
              </div>
            )}
          </div>
        </div>

        {/* Queue fill bar (only if maxQueue set) */}
        {dept.maxQueue > 0 && (
          <div>
            <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1">
              <span>Queue</span>
              <span>{dept.activeCount}/{dept.maxQueue} ({queuePct}%)</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${queuePct}%`,
                  backgroundColor: queuePct > 90 ? '#ef4444' : queuePct > 70 ? '#f59e0b' : dept.color,
                }}
              />
            </div>
          </div>
        )}

        {/* SLA breach rate */}
        {dept.slaBreachRate > 0 && (
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
            <span>SLA breach rate</span>
            <span className={dept.slaBreachRate > 20 ? 'text-red-500' : 'text-amber-500'}>
              {dept.slaBreachRate}%
            </span>
          </div>
        )}

        {/* Footer arrow */}
        <div className="flex items-center justify-end mt-auto text-slate-300 group-hover:text-slate-500 transition-colors">
          <span className="text-[10px] font-bold uppercase tracking-widest mr-1">Open Dashboard</span>
          <ChevronRight size={12} />
        </div>
      </div>
    </Link>
  );
}

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({ depts }: { depts: DeptSummary[] }) {
  const totalActive = depts.reduce((s, d) => s + d.activeCount, 0);
  const totalOverdue = depts.reduce((s, d) => s + d.overdueCount, 0);
  const totalToday = depts.reduce((s, d) => s + d.completedToday, 0);
  const critical = depts.filter((d) => d.health === 'critical').length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Total Active', value: totalActive, icon: Activity, color: 'text-blue-600' },
        { label: 'Completed Today', value: totalToday, icon: CheckCircle2, color: 'text-green-600' },
        { label: 'Overdue Orders', value: totalOverdue, icon: AlertTriangle, color: totalOverdue > 0 ? 'text-red-600' : 'text-slate-400' },
        { label: 'Critical Depts', value: critical, icon: TrendingUp, color: critical > 0 ? 'text-red-600' : 'text-slate-400' },
      ].map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
            <Icon size={13} className={color} />
          </div>
          <p className={`text-2xl font-black ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkflowHomePage() {
  const [depts, setDepts] = useState<DeptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchWorkflowHomeSummary();
      setDepts(data);
      setLastRefresh(new Date());
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER']}>
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Layers size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Production Workflow</h1>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Live overview of all production stages · refreshes every 30s
              </p>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {lastRefresh.toLocaleTimeString()}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 text-sm font-medium border border-red-100">
            Error: {error}
          </div>
        )}

        {/* Summary strip */}
        {!loading && depts.length > 0 && <SummaryStrip depts={depts} />}

        {/* Department cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl h-44 animate-pulse" />
            ))}
          </div>
        ) : depts.length === 0 ? (
          <div className="bg-yellow-50 text-yellow-800 p-8 rounded-xl border border-yellow-200 text-center">
            <Activity className="mx-auto mb-3 text-yellow-500" size={32} />
            <h3 className="text-lg font-bold">No Departments Found</h3>
            <p className="mt-2 text-sm opacity-90 max-w-sm mx-auto">
              Run the SQL seed script in your Supabase SQL Editor to populate the default departments.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {depts.map((dept) => (
              <DeptCard key={dept.id} dept={dept} />
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
