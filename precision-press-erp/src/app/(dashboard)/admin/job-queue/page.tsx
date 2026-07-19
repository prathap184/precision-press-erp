'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { getJobsList, retryJob, cancelJob, getJobAuditLogs } from '@/lib/actions/jobs';
import {
  RefreshCw, Play, CheckCircle2, XCircle, AlertCircle, Clock,
  Search, Filter, Trash2, Terminal, ExternalLink, Gauge, FileCode, ArrowRight, Activity, Calendar
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const dynamic = 'force-dynamic';

function timeAgo(dateString: string | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function AdminJobQueuePage() {
  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
      <Toaster position="top-right" />
      <JobQueueDashboard />
    </RoleGuard>
  );
}

function JobQueueDashboard() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'audit'>('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isPending, startTransition] = useTransition();
  const [processingQueue, setProcessingQueue] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const jobsRes = await getJobsList();
    const logsRes = await getJobAuditLogs();
    
    if (jobsRes.success && jobsRes.data) {
      setJobs(jobsRes.data);
    } else {
      toast.error(jobsRes.error || 'Failed to load jobs');
    }

    if (logsRes.success && logsRes.data) {
      setAuditLogs(logsRes.data);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const handleRetry = (jobId: string) => {
    startTransition(async () => {
      const res = await retryJob(jobId);
      if (res.success) {
        toast.success('Job reset to PENDING');
        fetchData();
      } else {
        toast.error(res.error || 'Failed to retry job');
      }
    });
  };

  const handleCancel = (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this pending job?')) return;
    startTransition(async () => {
      const res = await cancelJob(jobId);
      if (res.success) {
        toast.success('Job cancelled');
        fetchData();
      } else {
        toast.error(res.error || 'Failed to cancel job');
      }
    });
  };

  const triggerQueueProcessor = async () => {
    setProcessingQueue(true);
    try {
      const res = await fetch('/api/jobs/process', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Processed ${data.processed} jobs successfully!`);
        fetchData();
      } else {
        toast.error(data.error || 'Failed to run worker');
      }
    } catch (err: any) {
      toast.error(err.message || 'Worker network failure');
    } finally {
      setProcessingQueue(false);
    }
  };

  // Metrics calculations
  const totalJobs = jobs.length;
  const pendingJobs = jobs.filter(j => j.status === 'PENDING').length;
  const runningJobs = jobs.filter(j => j.status === 'RUNNING').length;
  const failedJobs = jobs.filter(j => j.status === 'FAILED').length;
  const retryingJobs = jobs.filter(j => j.status === 'RETRYING').length;
  const completedJobs = jobs.filter(j => j.status === 'COMPLETED').length;

  // Average processing time calculation
  const completedWithTime = jobs.filter(j => j.status === 'COMPLETED' && j.startedAt && j.completedAt);
  const totalProcessingTime = completedWithTime.reduce((sum, j) => {
    const start = new Date(j.startedAt).getTime();
    const end = new Date(j.completedAt).getTime();
    return sum + (end - start);
  }, 0);
  const avgProcessingTime = completedWithTime.length > 0 ? totalProcessingTime / completedWithTime.length : 0;

  // Longest running job calculation
  let longestRunningJob = '—';
  let longestRunningDuration = 0;
  completedWithTime.forEach(j => {
    const duration = new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime();
    if (duration > longestRunningDuration) {
      longestRunningDuration = duration;
      longestRunningJob = `${j.jobType} (${j.id.slice(0, 12)}...)`;
    }
  });

  // Worker throughput: completed jobs in last hour
  const oneHourAgo = new Date(Date.now() - 3600 * 1000);
  const throughputLastHour = completedWithTime.filter(j => new Date(j.completedAt) >= oneHourAgo).length;

  // Filtering
  const filteredJobs = jobs.filter(j => {
    const matchesSearch = j.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          j.parentOrderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (j.orderId && j.orderId.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || j.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || j.jobType === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const uniqueJobTypes = Array.from(new Set(jobs.map(j => j.jobType)));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-slate-800">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Activity size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Persistent Job Queue</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">Monitor, retry, and debug asynchronous background workers</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 h-11 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold rounded-xl text-sm transition"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={triggerQueueProcessor}
            disabled={processingQueue}
            className="flex items-center gap-2 px-5 h-11 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-100 transition"
          >
            {processingQueue ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
            Process Queue
          </button>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="Total Jobs" value={totalJobs} sub="All logged jobs" color="border-slate-200 text-slate-900" />
        <MetricCard label="Pending" value={pendingJobs} sub="Awaiting worker" color="border-amber-200 text-amber-600" />
        <MetricCard label="Running" value={runningJobs} sub="Processing now" color="border-blue-200 text-blue-600" />
        <MetricCard label="Retrying" value={retryingJobs} sub="Scheduled retries" color="border-purple-200 text-purple-600" />
        <MetricCard label="Failed" value={failedJobs} sub="Needs review" color="border-red-200 text-red-600" />
        <MetricCard label="Completed" value={completedJobs} sub="Success executions" color="border-emerald-200 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PerformanceCard
          title="Avg Processing Time"
          value={formatDuration(avgProcessingTime)}
          desc="Database-backed tasks duration"
          icon={<Clock size={20} />}
        />
        <PerformanceCard
          title="Longest Running Job"
          value={longestRunningJob}
          desc={longestRunningDuration > 0 ? `Duration: ${formatDuration(longestRunningDuration)}` : 'No completed jobs'}
          icon={<Terminal size={20} />}
        />
        <PerformanceCard
          title="Worker Throughput"
          value={`${throughputLastHour} jobs/hr`}
          desc="Successfully processed last 60m"
          icon={<Gauge size={20} />}
        />
      </div>

      {/* Tabs and Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Tab Header */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 p-1">
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition ${activeTab === 'queue' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Activity size={16} />
            Job Queue
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition ${activeTab === 'audit' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <FileCode size={16} />
            Job Audit Logs
          </button>
        </div>

        {activeTab === 'queue' ? (
          <div>
            {/* Filter controls */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search by Job ID, Parent Order ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 h-11 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none text-sm bg-slate-50/50"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex items-center gap-2 border border-slate-200 px-3 py-1.5 rounded-xl bg-slate-50/50">
                  <Filter size={14} className="text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-transparent text-sm focus:outline-none font-semibold text-slate-700"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="RUNNING">Running</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="FAILED">Failed</option>
                    <option value="RETRYING">Retrying</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 border border-slate-200 px-3 py-1.5 rounded-xl bg-slate-50/50">
                  <Filter size={14} className="text-slate-400" />
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="bg-transparent text-sm focus:outline-none font-semibold text-slate-700"
                  >
                    <option value="ALL">All Job Types</option>
                    {uniqueJobTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Queue Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/20 text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3.5 px-6">Job ID</th>
                    <th className="py-3.5 px-4">Job Type</th>
                    <th className="py-3.5 px-4">Parent Order</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-center">Attempts</th>
                    <th className="py-3.5 px-4">Timeline</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredJobs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-semibold">
                        No background jobs matching the selected criteria
                      </td>
                    </tr>
                  ) : (
                    filteredJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/30 transition">
                        <td className="py-4 px-6 font-mono text-xs font-bold text-slate-600">
                          {job.id}
                        </td>
                        <td className="py-4 px-4 font-bold text-slate-800">
                          {job.jobType}
                        </td>
                        <td className="py-4 px-4 font-semibold text-indigo-600 hover:underline">
                          <a href={`/admin/orders?search=${job.parentOrderId}`} target="_blank" rel="noreferrer" className="flex items-center gap-1">
                            {job.parentOrderId}
                            <ExternalLink size={10} />
                          </a>
                        </td>
                        <td className="py-4 px-4">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="py-4 px-4 text-center font-bold text-slate-600">
                          {job.attempts} / {job.maxAttempts}
                        </td>
                        <td className="py-4 px-4">
                          <div className="space-y-0.5 text-xs text-slate-500">
                            <div>Created: {timeAgo(job.createdAt)}</div>
                            {job.startedAt && <div>Started: {timeAgo(job.startedAt)}</div>}
                            {job.completedAt && <div>Done: {timeAgo(job.completedAt)}</div>}
                            {job.failedAt && <div>Failed: {timeAgo(job.failedAt)}</div>}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right space-x-2">
                          <button
                            onClick={() => setSelectedJob(job)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 text-slate-600 font-bold rounded-lg text-xs transition"
                          >
                            <Terminal size={12} />
                            Inspect
                          </button>
                          {(job.status === 'FAILED' || job.status === 'RETRYING') && (
                            <button
                              onClick={() => handleRetry(job.id)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-lg text-xs transition"
                            >
                              <RefreshCw size={12} />
                              Retry
                            </button>
                          )}
                          {(job.status === 'PENDING' || job.status === 'RETRYING') && (
                            <button
                              onClick={() => handleCancel(job.id)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs transition"
                            >
                              <Trash2 size={12} />
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            {/* Audit log list view */}
            <div className="p-4 border-b border-slate-100 flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search audit logs by job or action..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 h-11 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none text-sm bg-slate-50/50"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {auditLogs
                .filter(l => 
                  l.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  l.target_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  l.actor_id.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .length === 0 ? (
                  <div className="py-12 text-center text-slate-400 font-semibold">
                    No job audit logs found
                  </div>
                ) : (
                  auditLogs
                    .filter(l => 
                      l.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      l.target_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      l.actor_id.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((log) => (
                      <div key={log.id} className="p-4 hover:bg-slate-50/20 flex flex-col md:flex-row md:items-center justify-between gap-4 transition">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl mt-0.5 ${
                            log.action_type.includes('Completed') ? 'bg-emerald-50 text-emerald-600' :
                            log.action_type.includes('Failed') ? 'bg-red-50 text-red-600' :
                            log.action_type.includes('Retry') ? 'bg-indigo-50 text-indigo-600' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            <Activity size={16} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{log.action_type}</span>
                              <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-mono">
                                {log.target_id.slice(0, 12)}...
                              </span>
                            </div>
                            <p className="text-slate-500 text-xs mt-1">
                              By {log.actor_name} ({log.actor_id})
                            </p>
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div className="mt-2 text-xs font-mono bg-slate-50 border border-slate-100 rounded-lg p-2 max-w-xl overflow-x-auto text-slate-600">
                                {JSON.stringify(log.metadata)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400 text-xs flex-shrink-0">
                          <Calendar size={12} />
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))
                )}
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 space-y-4 max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Inspect Job: {selectedJob.jobType}</h3>
                <p className="text-slate-400 text-xs font-mono mt-0.5">{selectedJob.id}</p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="p-1 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-400 text-xs font-bold uppercase">Status</div>
                <div className="mt-1"><StatusBadge status={selectedJob.status} /></div>
              </div>
              <div>
                <div className="text-slate-400 text-xs font-bold uppercase">Attempts</div>
                <div className="mt-1 font-bold text-slate-800">{selectedJob.attempts} / {selectedJob.maxAttempts}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs font-bold uppercase">Priority</div>
                <div className="mt-1 font-bold text-slate-800">
                  {selectedJob.priority === 1 ? '1 - Critical' :
                   selectedJob.priority === 2 ? '2 - High' :
                   selectedJob.priority === 3 ? '3 - Medium' :
                   '4 - Low'}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-xs font-bold uppercase">Parent Order</div>
                <div className="mt-1 font-bold text-indigo-600 font-mono">{selectedJob.parentOrderId}</div>
              </div>
            </div>

            <div>
              <div className="text-slate-400 text-xs font-bold uppercase mb-1.5 flex items-center gap-1">
                <FileCode size={14} />
                Payload Parameters
              </div>
              <pre className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto max-h-40 text-slate-700">
                {JSON.stringify(selectedJob.payload, null, 2)}
              </pre>
            </div>

            {selectedJob.errorMessage && (
              <div className="space-y-2">
                <div className="text-red-500 text-xs font-bold uppercase flex items-center gap-1">
                  <AlertCircle size={14} />
                  Error Message
                </div>
                <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                  {selectedJob.errorMessage}
                </div>
              </div>
            )}

            {selectedJob.stackTrace && (
              <div>
                <div className="text-slate-400 text-xs font-bold uppercase mb-1.5 flex items-center gap-1">
                  <Terminal size={14} />
                  Stack Trace / Debugging Log
                </div>
                <pre className="text-xs font-mono bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-x-auto max-h-40 text-slate-300">
                  {selectedJob.stackTrace}
                </pre>
              </div>
            )}

            {selectedJob.sqlError && (
              <div>
                <div className="text-slate-400 text-xs font-bold uppercase mb-1">SQL Error Code</div>
                <div className="text-xs font-mono text-slate-600 bg-slate-100 rounded-lg p-2">
                  {selectedJob.sqlError}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              {(selectedJob.status === 'FAILED' || selectedJob.status === 'RETRYING') && (
                <button
                  onClick={() => {
                    handleRetry(selectedJob.id);
                    setSelectedJob(null);
                  }}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition"
                >
                  <RefreshCw size={12} />
                  Retry Job
                </button>
              )}
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between ${color.split(' ')[0]}`}>
      <div>
        <div className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">{label}</div>
        <div className={`text-2xl font-black mt-1.5 ${color.split(' ').slice(1).join(' ')}`}>{value}</div>
      </div>
      <div className="text-slate-400 text-[10px] mt-2 font-semibold flex items-center gap-1">
        {sub}
      </div>
    </div>
  );
}

function PerformanceCard({ title, value, desc, icon }: { title: string; value: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
      <div className="p-3 bg-slate-50 border border-slate-100 text-slate-600 rounded-2xl">
        {icon}
      </div>
      <div>
        <div className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">{title}</div>
        <div className="text-lg font-black text-slate-900 mt-1">{value}</div>
        <div className="text-slate-400 text-[10px] mt-0.5 font-medium">{desc}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING' }) {
  const configs = {
    PENDING: { bg: 'bg-amber-50 text-amber-600 border-amber-100', icon: <Clock size={12} /> },
    RUNNING: { bg: 'bg-blue-50 text-blue-600 border-blue-100', icon: <RefreshCw size={12} className="animate-spin" /> },
    COMPLETED: { bg: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: <CheckCircle2 size={12} /> },
    FAILED: { bg: 'bg-red-50 text-red-600 border-red-100', icon: <XCircle size={12} /> },
    RETRYING: { bg: 'bg-purple-50 text-purple-600 border-purple-100', icon: <AlertCircle size={12} /> },
  };

  const cfg = configs[status] || configs.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 border rounded-lg text-xs font-bold ${cfg.bg}`}>
      {cfg.icon}
      {status}
    </span>
  );
}
