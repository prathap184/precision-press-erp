'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import {
  Activity, Server, Zap, Shield, Database, Cloud,
  RefreshCw, AlertTriangle, CheckCircle2, Clock,
  ArrowUpRight, Cpu, HardDrive, TrendingUp, Users,
  AlertCircle, XCircle, Timer
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerHealth {
  worker_id: string;
  status: string;
  last_heartbeat: string;
}

interface JobStat {
  status: string;
  count: number;
}

interface RateLimitStat {
  key: string;
  hits: number;
  reset_at: string;
}

interface NotifStat {
  channel: string;
  status: string;
  count: number;
}

interface MonitoringData {
  workers: WorkerHealth[];
  jobStats: JobStat[];
  recentAuditCount: number;
  rateLimits: RateLimitStat[];
  notifStats: NotifStat[];
  dbStatus: 'OK' | 'DEGRADED' | 'DOWN';
  fetchedAt: string;
}

// ─── Fetch hook ───────────────────────────────────────────────────────────────

async function fetchMonitoringData(): Promise<MonitoringData> {
  const res = await fetch('/api/monitoring/health', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch monitoring data');
  return res.json();
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'text-slate-900',
  bg = 'bg-slate-50',
  sub,
}: {
  label: string;
  value: string | number;
  icon: any;
  color?: string;
  bg?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-1">{label}</p>
        <h3 className={`text-xl font-black tracking-tight ${color}`}>{value}</h3>
        {sub && <p className="text-[9px] text-slate-400 mt-0.5 font-medium">{sub}</p>}
      </div>
      <div className={`p-2.5 rounded-xl ${bg} group-hover:scale-110 transition-transform duration-200`}>
        <Icon size={18} className={color} strokeWidth={2.5} />
      </div>
    </div>
  );
}

function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon: any }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 bg-slate-900 rounded-lg flex items-center justify-center">
        <Icon size={13} className="text-white" />
      </div>
      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-700">{children}</h2>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-400 shadow-emerald-300/50 shadow-sm' : 'bg-red-400 shadow-red-300/50 shadow-sm'}`} />
  );
}

function Badge({ children, color = 'bg-slate-100 text-slate-600' }: { children: React.ReactNode; color?: string }) {
  return (
    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${color}`}>
      {children}
    </span>
  );
}

function WorkerRow({ worker }: { worker: WorkerHealth }) {
  const isAlive = (Date.now() - new Date(worker.last_heartbeat).getTime()) < 30000;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-2">
        <StatusDot ok={isAlive} />
        <p className="text-[10px] font-bold text-slate-700 font-mono">{worker.worker_id.slice(0, 20)}…</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge color={isAlive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}>
          {isAlive ? 'Active' : 'Dead'}
        </Badge>
        <span className="text-[9px] text-slate-400">
          {new Date(worker.last_heartbeat).toLocaleTimeString('en-IN', { hour12: false })}
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMonitoringData();
      setData(result);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [refresh]);

  // Derived stats
  const totalJobs = data?.jobStats.reduce((a, b) => a + b.count, 0) || 0;
  const completedJobs = data?.jobStats.find(j => j.status === 'COMPLETED')?.count || 0;
  const failedJobs = data?.jobStats.find(j => j.status === 'FAILED')?.count || 0;
  const pendingJobs = data?.jobStats.find(j => j.status === 'PENDING')?.count || 0;
  const runningJobs = data?.jobStats.find(j => j.status === 'RUNNING')?.count || 0;
  const activeWorkers = data?.workers.filter(w => (Date.now() - new Date(w.last_heartbeat).getTime()) < 30000).length || 0;
  const totalNotifSent = data?.notifStats.filter(n => n.status === 'SENT').reduce((a, b) => a + b.count, 0) || 0;
  const totalNotifFailed = data?.notifStats.filter(n => n.status === 'FAILED').reduce((a, b) => a + b.count, 0) || 0;

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <div className="space-y-6 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* ─── Header ─── */}
        <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.35em] mb-1">System Health</p>
            <h1 className="text-[28px] font-black font-display text-slate-900 tracking-tight leading-none">
              Production Monitoring
            </h1>
            <p className="text-[10px] text-slate-400 mt-2 font-medium">
              Last refreshed: {lastRefresh.toLocaleTimeString('en-IN', { hour12: false })} · Auto-refresh every 30s
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-900 text-white px-5 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </section>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-500 shrink-0" />
            <p className="text-sm font-bold text-red-600">{error}</p>
          </div>
        )}

        {/* ─── Top KPIs ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <StatCard label="DB Status"       value={data?.dbStatus || '—'}   icon={Database}    color={data?.dbStatus === 'OK' ? 'text-emerald-600' : 'text-red-500'} bg={data?.dbStatus === 'OK' ? 'bg-emerald-50' : 'bg-red-50'} />
          <StatCard label="Active Workers"  value={activeWorkers}            icon={Server}       color="text-indigo-600" bg="bg-indigo-50" sub={`${(data?.workers.length || 0)} total`} />
          <StatCard label="Pending Jobs"    value={pendingJobs}              icon={Clock}        color="text-amber-600" bg="bg-amber-50" />
          <StatCard label="Running Jobs"    value={runningJobs}              icon={Zap}          color="text-blue-600" bg="bg-blue-50" />
          <StatCard label="Failed Jobs"     value={failedJobs}               icon={XCircle}      color={failedJobs > 0 ? 'text-red-600' : 'text-slate-500'} bg={failedJobs > 0 ? 'bg-red-50' : 'bg-slate-50'} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Completed Jobs"  value={completedJobs}            icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" sub={`of ${totalJobs} total`} />
          <StatCard label="Audit Records"   value={data?.recentAuditCount || 0} icon={Shield}   color="text-violet-600" bg="bg-violet-50" sub="Last 24 hours" />
          <StatCard label="Notifications"   value={totalNotifSent}           icon={Activity}     color="text-sky-600" bg="bg-sky-50" sub={`${totalNotifFailed} failed`} />
          <StatCard label="Rate Limit Keys" value={data?.rateLimits.length || 0} icon={TrendingUp} color="text-orange-600" bg="bg-orange-50" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ─── Worker Health ─── */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <SectionTitle icon={Server}>Worker Health</SectionTitle>
            {loading && !data ? (
              <div className="h-32 flex items-center justify-center">
                <RefreshCw size={20} className="animate-spin text-slate-300" />
              </div>
            ) : data?.workers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No active workers</p>
                <p className="text-[9px] text-slate-300 mt-1">Workers appear when jobs are processing</p>
              </div>
            ) : (
              <div>
                {data?.workers.map(w => <WorkerRow key={w.worker_id} worker={w} />)}
              </div>
            )}
          </div>

          {/* ─── Job Queue Stats ─── */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <SectionTitle icon={Zap}>Job Queue</SectionTitle>
            <div className="space-y-2">
              {[
                { status: 'COMPLETED', color: 'bg-emerald-400', text: 'text-emerald-600' },
                { status: 'PENDING',   color: 'bg-amber-400',   text: 'text-amber-600' },
                { status: 'RUNNING',   color: 'bg-blue-400',    text: 'text-blue-600' },
                { status: 'RETRYING',  color: 'bg-orange-400',  text: 'text-orange-600' },
                { status: 'FAILED',    color: 'bg-red-400',     text: 'text-red-600' },
              ].map(({ status, color, text }) => {
                const stat = data?.jobStats.find(j => j.status === status);
                const count = stat?.count || 0;
                const pct = totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0;
                return (
                  <div key={status}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{status}</span>
                      <span className={`text-[10px] font-black ${text}`}>{count}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Rate Limits ─── */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <SectionTitle icon={Shield}>Rate Limits (Active)</SectionTitle>
            {!data || data.rateLimits.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No active limits</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.rateLimits.slice(0, 8).map((rl) => (
                  <div key={rl.key} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <p className="text-[10px] font-mono font-bold text-slate-700">{rl.key}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-rose-600">{rl.hits} hits</span>
                      <span className="text-[9px] text-slate-400">
                        {new Date(rl.reset_at).toLocaleTimeString('en-IN', { hour12: false })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Notification Channel Breakdown ─── */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <SectionTitle icon={Activity}>Notification Delivery (Last 24h)</SectionTitle>
          {!data || data.notifStats.length === 0 ? (
            <p className="text-[10px] text-slate-300 font-black uppercase tracking-widest text-center py-6">No notifications sent yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'].map(channel => {
                const sent = data.notifStats.filter(n => n.channel === channel && n.status === 'SENT').reduce((a, b) => a + b.count, 0);
                const failed = data.notifStats.filter(n => n.channel === channel && n.status === 'FAILED').reduce((a, b) => a + b.count, 0);
                return (
                  <div key={channel} className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{channel.replace('_', ' ')}</p>
                    <p className="text-2xl font-black text-slate-900">{sent}</p>
                    <p className="text-[9px] text-slate-400 mt-1">sent · <span className="text-red-500">{failed} failed</span></p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── System Info Footer ─── */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60">System Information</h3>
            <Badge color="bg-emerald-500/20 text-emerald-400">Phase 5 · Production Hardened</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Platform',     value: 'Next.js 14 + Supabase' },
              { label: 'Auth',         value: 'Firebase Admin SDK' },
              { label: 'Rate Limits',  value: 'PostgreSQL RPC' },
              { label: 'File Storage', value: 'Cloudinary + SHA-256' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-0.5">{label}</p>
                <p className="text-[11px] font-bold text-white/90">{value}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </RoleGuard>
  );
}
