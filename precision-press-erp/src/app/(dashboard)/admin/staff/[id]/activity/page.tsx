'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RoleGuard } from '@/lib/role-guard';
import { StaffUser, StaffRole, ROLE_META, StaffStatus } from '@/types/roles';
import { getComprehensiveStaffActivity, StaffActivityEvent } from '@/lib/actions/staff';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Filter,
  History,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Tag,
  Printer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Package,
  Layers,
  ArrowRight,
  User,
  ShoppingBag,
  Info,
  ExternalLink,
} from 'lucide-react';

function timeAgo(dateString: string): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDateHeader(dateString: string): string {
  if (!dateString) return 'Undated';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Undated';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const formattedDate = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  if (isToday) return `Today – ${formattedDate}`;
  if (isYesterday) return `Yesterday – ${formattedDate}`;
  return formattedDate;
}

function formatEventTime(dateString: string): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const STATUS_CONFIG: Record<StaffStatus, { label: string; color: string; bg: string; icon: any }> = {
  ACTIVE:    { label: 'Active',    color: '#059669', bg: '#d1fae5', icon: CheckCircle2 },
  SUSPENDED: { label: 'Suspended', color: '#d97706', bg: '#fef3c7', icon: AlertTriangle },
  DISABLED:  { label: 'Disabled',  color: '#dc2626', bg: '#fee2e2', icon: XCircle },
};

export default function StaffActivityPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params?.id;

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [events, setEvents] = useState<StaffActivityEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadActivity = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await getComprehensiveStaffActivity(userId);
      setStaff(res.staff);
      setEvents(res.events);
    } catch (err) {
      console.error('Failed to load staff activity:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Type filter
      if (typeFilter !== 'ALL' && event.type !== typeFilter) {
        return false;
      }

      // Date range filter
      if (startDate) {
        const start = new Date(startDate).setHours(0, 0, 0, 0);
        const evDate = new Date(event.timestamp).getTime();
        if (evDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        const evDate = new Date(event.timestamp).getTime();
        if (evDate > end) return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(query);
        const matchesDesc = event.description.toLowerCase().includes(query);
        const matchesActor = event.actorName?.toLowerCase().includes(query);
        const matchesOrderId = event.metadata?.orderId?.toLowerCase().includes(query);
        return matchesTitle || matchesDesc || matchesActor || matchesOrderId;
      }

      return true;
    });
  }, [events, typeFilter, startDate, endDate, searchTerm]);

  // Group events chronologically by date
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: StaffActivityEvent[] } = {};
    filteredEvents.forEach(event => {
      const dateKey = event.timestamp ? new Date(event.timestamp).toISOString().split('T')[0] : 'undated';
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });

    // Sort date keys descending
    return Object.keys(groups)
      .sort((a, b) => (b > a ? 1 : -1))
      .map(dateKey => ({
        dateKey,
        header: formatDateHeader(groups[dateKey][0]?.timestamp),
        events: groups[dateKey],
      }));
  }, [filteredEvents]);

  // Stats calculation
  const stats = useMemo(() => {
    const totalEvents = events.length;
    const roleChanges = events.filter(e => e.type === 'ROLE_CHANGE' || e.type === 'STATUS_CHANGE').length;
    const stagesProcessed = events.filter(e => e.type === 'ORDER_PROCESSED').length;
    const ordersCreated = events.filter(e => e.type === 'ORDER_CREATED').length;
    return { totalEvents, roleChanges, stagesProcessed, ordersCreated };
  }, [events]);

  const StatusIcon = staff ? (STATUS_CONFIG[staff.status]?.icon || CheckCircle2) : CheckCircle2;
  const statusCfg = staff ? (STATUS_CONFIG[staff.status] || STATUS_CONFIG.ACTIVE) : STATUS_CONFIG.ACTIVE;

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Back Link & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/staff"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition shadow-sm"
            >
              <ArrowLeft size={16} />
              Back to Staff
            </Link>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                <History className="text-indigo-600" size={22} />
                Staff Account Activity History
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Complete chronological log of permissions, production workflows, and order actions
              </p>
            </div>
          </div>

          <button
            onClick={loadActivity}
            disabled={loading}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Activity
          </button>
        </div>

        {/* Staff Profile Overview Card */}
        {staff ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-xl shadow-md shrink-0">
                  {staff.name ? staff.name.charAt(0).toUpperCase() : <User size={24} />}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-lg font-black text-slate-900">{staff.name}</h2>
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                      style={{ color: statusCfg.color, background: statusCfg.bg }}
                    >
                      <StatusIcon size={12} />
                      {statusCfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">{staff.email} • ID: {staff.uid}</p>

                  {/* Roles */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">Roles:</span>
                    {(staff.roles || []).map(r => {
                      const meta = ROLE_META[r];
                      return (
                        <span
                          key={r}
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-2xs"
                          style={{ color: meta?.color || '#475569', background: meta?.bg || '#f1f5f9' }}
                        >
                          {meta?.label || r}
                        </span>
                      );
                    })}
                  </div>

                  {/* Printing categories / streams if applicable */}
                  {((staff.printerCategories && staff.printerCategories.length > 0) || staff.printerCategory) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 mr-1 flex items-center gap-1">
                        <Printer size={10} /> Streams:
                      </span>
                      {(staff.printerCategories || [staff.printerCategory]).filter(Boolean).map((cat, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          {cat}
                        </span>
                      ))}
                      {(staff.printerSubCategories || (staff.printerSubCategory ? [staff.printerSubCategory] : [])).filter(Boolean).map((sub, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          ↳ {sub}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Timestamp details */}
              <div className="text-xs text-slate-500 space-y-1 bg-slate-50/80 p-3 rounded-xl border border-slate-100 shrink-0">
                <div><span className="font-semibold text-slate-700">Last Login:</span> {timeAgo(staff.lastLoginAt)}</div>
                <div><span className="font-semibold text-slate-700">Last Profile Update:</span> {timeAgo(staff.updatedAt)}</div>
                {staff.assignedBy && <div><span className="font-semibold text-slate-700">Assigned By:</span> {staff.assignedBy}</div>}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-indigo-600 mr-2" size={20} />
            <span className="text-xs font-semibold text-slate-500">Loading staff account details...</span>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-800 text-xs font-bold">
            Staff account profile not found or user ID is invalid.
          </div>
        )}

        {/* Quick Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Actions</span>
              <Layers size={16} className="text-indigo-500" />
            </div>
            <div className="text-2xl font-black text-slate-900">{stats.totalEvents}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Recorded across all modules</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Role & Status</span>
              <ShieldCheck size={16} className="text-amber-500" />
            </div>
            <div className="text-2xl font-black text-slate-900">{stats.roleChanges}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Audit history changes</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Stages Completed</span>
              <CheckCircle2 size={16} className="text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-slate-900">{stats.stagesProcessed}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Workflow stages finalized</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Proxy Orders</span>
              <ShoppingBag size={16} className="text-blue-500" />
            </div>
            <div className="text-2xl font-black text-slate-900">{stats.ordersCreated}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Orders placed by user</div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Search Bar */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Search activity, orders, roles, notes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Type Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
              {[
                { id: 'ALL', label: 'All Activities' },
                { id: 'ROLE_CHANGE', label: 'Roles Audit' },
                { id: 'STATUS_CHANGE', label: 'Status' },
                { id: 'ORDER_PROCESSED', label: 'Stages Completed' },
                { id: 'ORDER_CREATED', label: 'Proxy Orders' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setTypeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold tracking-tight whitespace-nowrap transition cursor-pointer ${
                    typeFilter === tab.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Selectors */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <span className="font-bold text-slate-500 flex items-center gap-1">
              <Calendar size={13} /> Filter by Date Range:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                Reset Dates
              </button>
            )}
            <span className="ml-auto text-[11px] font-semibold text-slate-400">
              Showing {filteredEvents.length} of {events.length} records
            </span>
          </div>
        </div>

        {/* Timeline Grouped by Date */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
            <Loader2 className="animate-spin text-indigo-600 mx-auto" size={28} />
            <p className="text-xs font-bold text-slate-600">Gathering account activity from audit logs and orders...</p>
          </div>
        ) : groupedEvents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <History size={24} />
            </div>
            <h3 className="text-sm font-black text-slate-800">No Activity Recorded</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchTerm || typeFilter !== 'ALL' || startDate || endDate
                ? 'No activity matches the current search or filters. Try adjusting your search criteria.'
                : 'This staff account does not have any recorded role updates, completed workflow stages, or proxy orders yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedEvents.map(group => (
              <div key={group.dateKey} className="space-y-3">
                {/* Date Header Sticky Pill */}
                <div className="sticky top-4 z-10 flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-[11px] font-black tracking-wide shadow-sm flex items-center gap-1.5">
                    <Calendar size={12} className="text-indigo-400" />
                    {group.header}
                  </span>
                  <div className="h-px bg-slate-200 flex-1" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {group.events.length} {group.events.length === 1 ? 'event' : 'events'}
                  </span>
                </div>

                {/* Event Cards */}
                <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-indigo-100 ml-3">
                  {group.events.map(event => {
                    let IconComponent = History;
                    let iconBg = 'bg-slate-100 text-slate-700';

                    if (event.type === 'ROLE_CHANGE') {
                      IconComponent = ShieldCheck;
                      iconBg = 'bg-indigo-50 text-indigo-600 border border-indigo-200';
                    } else if (event.type === 'STATUS_CHANGE') {
                      IconComponent = User;
                      iconBg = 'bg-amber-50 text-amber-600 border border-amber-200';
                    } else if (event.type === 'ORDER_PROCESSED') {
                      IconComponent = CheckCircle2;
                      iconBg = 'bg-emerald-50 text-emerald-600 border border-emerald-200';
                    } else if (event.type === 'ORDER_CREATED') {
                      IconComponent = ShoppingBag;
                      iconBg = 'bg-blue-50 text-blue-600 border border-blue-200';
                    }

                    return (
                      <div
                        key={event.id}
                        className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-shadow relative group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                              <IconComponent size={18} />
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-xs font-black text-slate-900">{event.title}</h4>
                                {event.badges?.map((badge, bIdx) => (
                                  <span
                                    key={bIdx}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                    style={{ color: badge.color || '#475569', background: badge.bg || '#f1f5f9' }}
                                  >
                                    {badge.label}
                                  </span>
                                ))}
                              </div>

                              <p className="text-xs text-slate-600 font-medium">
                                {event.description}
                              </p>

                              {/* Role Change Metadata Diffs */}
                              {event.type === 'ROLE_CHANGE' && event.metadata?.newRoles && (
                                <div className="mt-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-wrap items-center gap-2">
                                  {event.metadata.oldRoles && (
                                    <>
                                      <span className="font-bold text-slate-400">Previous:</span>
                                      <div className="flex flex-wrap gap-1">
                                        {(event.metadata.oldRoles as string[]).map((r, rIdx) => (
                                          <span key={rIdx} className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[9px] font-bold">
                                            {r}
                                          </span>
                                        ))}
                                      </div>
                                      <ArrowRight size={12} className="text-slate-400" />
                                    </>
                                  )}
                                  <span className="font-bold text-slate-600">Assigned:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {(event.metadata.newRoles as string[]).map((r, rIdx) => (
                                      <span key={rIdx} className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold">
                                        {r}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Order Link Action */}
                              {event.metadata?.orderId && (
                                <div className="pt-1.5">
                                  <Link
                                    href={`/orders/${event.metadata.orderId}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                                  >
                                    <span>View Order Details</span>
                                    <ExternalLink size={10} />
                                  </Link>
                                </div>
                              )}

                              {/* Performed by details */}
                              <div className="pt-1 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                                {event.actorName && (
                                  <span>Action by: <strong className="text-slate-600">{event.actorName}</strong></span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Time Stamp */}
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1 shrink-0 pt-1 sm:pt-0">
                            <span className="text-xs font-bold text-slate-700 font-mono">
                              {formatEventTime(event.timestamp)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {timeAgo(event.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </RoleGuard>
  );
}
