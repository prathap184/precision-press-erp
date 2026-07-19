'use client';
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import {
  StaffRole, StaffUser, RoleHistoryEntry, StaffStatus,
  ALL_STAFF_ROLES, ROLE_META, PrinterCategory, ALL_PRINTER_CATEGORIES, PRINTER_CATEGORY_META
} from '@/types/roles';
import {
  updateStaffRoles, updateStaffStatus,
  getStaffList, getRoleHistory,
} from '@/lib/actions/staff';
import {
  Users, Search, Shield, CheckCircle2, XCircle,
  Clock, AlertTriangle, ChevronDown, ChevronUp,
  History, Loader2, Ban, RefreshCw, ShieldCheck,
  UserX, UserCheck, X, Plus,
} from 'lucide-react';
import Link from 'next/link';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts: any): string {
  if (!ts) return '—';
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_CONFIG: Record<StaffStatus, { label: string; color: string; bg: string; icon: any }> = {
  ACTIVE:    { label: 'Active',    color: '#059669', bg: '#d1fae5', icon: CheckCircle2 },
  SUSPENDED: { label: 'Suspended', color: '#d97706', bg: '#fef3c7', icon: AlertTriangle },
  DISABLED:  { label: 'Disabled',  color: '#dc2626', bg: '#fee2e2', icon: XCircle },
};

// ─── Role Badge ───────────────────────────────────────────────────────────────
const RoleBadge = ({ role, onRemove }: { role: StaffRole; onRemove?: () => void }) => {
  const meta = ROLE_META[role];
  // Skip rendering if role metadata is undefined (deleted/deprecated role)
  if (!meta) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ color: meta.color, background: meta.bg }}
    >
      {meta.label}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 hover:opacity-70 transition-opacity">
          <X size={10} />
        </button>
      )}
    </span>
  );
};

// ─── Confirmation Modal ───────────────────────────────────────────────────────
interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
const ConfirmModal = ({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: ConfirmModalProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4 animate-in zoom-in-95 duration-200">
        <h3 className="text-base font-black text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{message}</p>
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onCancel} className="px-4 h-11 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-xl text-white transition ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Role History Panel ───────────────────────────────────────────────────────
const HistoryPanel = ({ userId }: { userId: string }) => {
  const [entries, setEntries] = useState<RoleHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRoleHistory(userId).then(e => { setEntries(e); setLoading(false); });
  }, [userId]);

  if (loading) return <div className="py-4 text-center text-xs text-slate-400">Loading history…</div>;
  if (!entries.length) return <div className="py-4 text-center text-xs text-slate-400">No history yet.</div>;

  return (
    <div className="space-y-2 mt-3 max-h-48 overflow-y-auto">
      {entries.map((e, i) => (
        <div key={e.id ?? i} className="flex gap-3 text-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0" />
          <div>
            <span className="font-bold text-slate-700">{e.action}</span>
            <span className="text-slate-400"> by {e.changedByName} · {timeAgo(e.changedAt)}</span>
            {e.reason && <p className="text-slate-400 italic">&quot;{e.reason}&quot;</p>}
            <div className="flex flex-wrap gap-1 mt-1">
              {e.newRoles.map(r => <RoleBadge key={r} role={r} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Staff Row ────────────────────────────────────────────────────────────────
const StaffRow = ({ staff, onRefresh }: { staff: StaffUser; onRefresh: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Filter out deleted roles (PASTING, FINISHING, FIXING) when initializing
  const validRoles = staff.roles.filter(r => ROLE_META[r]);
  const [pendingRoles, setPendingRoles] = useState<StaffRole[]>(validRoles);
  const [pendingPrinterCategory, setPendingPrinterCategory] = useState<PrinterCategory | undefined>(staff.printerCategory);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<null | { title: string; message: string; action: () => void; danger?: boolean }>(null);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const isDirty = JSON.stringify(pendingRoles.sort()) !== JSON.stringify(staff.roles.sort()) || 
                  (pendingRoles.includes('PRINTER') && pendingPrinterCategory !== staff.printerCategory);

  const handleToggleRole = (role: StaffRole) => {
    setPendingRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSaveRoles = () => {
    if (pendingRoles.length === 0) {
      showToast('Must assign at least one role');
      return;
    }
    setConfirm({
      title: 'Update Roles',
      message: `Assign [${pendingRoles.map(r => ROLE_META[r]?.label || r).join(', ')}] to ${staff.name}? This takes effect immediately.`,
      action: () => {
        startTransition(async () => {
          const res = await updateStaffRoles(
            staff.uid, 
            pendingRoles, 
            reason || undefined,
            pendingRoles.includes('PRINTER') ? pendingPrinterCategory : undefined
          );
          if (res.success) { showToast('✅ Roles updated'); onRefresh(); }
          else showToast(`❌ ${res.error}`);
          setConfirm(null);
          setReason('');
        });
      },
    });
  };

  const handleStatus = (newStatus: StaffStatus) => {
    const cfg = STATUS_CONFIG[newStatus];
    setConfirm({
      title: `${cfg.label} ${staff.name}`,
      message: newStatus === 'SUSPENDED'
        ? `${staff.name} will lose access immediately. Their session will be invalidated.`
        : newStatus === 'ACTIVE'
        ? `Restore access for ${staff.name}?`
        : `Permanently disable ${staff.name}? This is reversible only by an Admin.`,
      danger: newStatus !== 'ACTIVE',
      action: () => {
        startTransition(async () => {
          const res = await updateStaffStatus(staff.uid, newStatus, reason || undefined);
          if (res.success) { showToast(`✅ Status set to ${cfg.label}`); onRefresh(); }
          else showToast(`❌ ${res.error}`);
          setConfirm(null);
        });
      },
    });
  };

  const statusCfg = STATUS_CONFIG[staff.status] ?? STATUS_CONFIG.ACTIVE;
  const StatusIcon = statusCfg.icon;

  return (
    <>
      <ConfirmModal
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        danger={confirm?.danger}
        onConfirm={confirm?.action ?? (() => {})}
        onCancel={() => setConfirm(null)}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-5 py-3 rounded-2xl shadow-xl animate-in slide-in-from-bottom-4 duration-300">
          {toast}
        </div>
      )}

      {/* Main Row */}
      <div className={`bg-white rounded-2xl border transition-all duration-200 ${expanded ? 'border-slate-300 shadow-lg' : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'}`}>
        <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setExpanded(v => !v)}>

          {/* Avatar */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-black text-slate-500">{staff.name.charAt(0).toUpperCase()}</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-black text-slate-800 truncate">{staff.name}</p>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
                style={{ color: statusCfg.color, background: statusCfg.bg }}
              >
                <StatusIcon size={9} />
                {statusCfg.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">{staff.email}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {staff.roles.map(r => <RoleBadge key={r} role={r} />)}
              {staff.roles.includes('PRINTER') && staff.printerCategory && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border"
                  style={{ 
                    color: PRINTER_CATEGORY_META[staff.printerCategory]?.color || '#64748b', 
                    background: PRINTER_CATEGORY_META[staff.printerCategory]?.bg || '#f1f5f9',
                    borderColor: PRINTER_CATEGORY_META[staff.printerCategory]?.color || '#cbd5e1'
                  }}
                >
                  {PRINTER_CATEGORY_META[staff.printerCategory]?.label || staff.printerCategory}
                </span>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="text-right hidden sm:block flex-shrink-0">
            <p className="text-[10px] text-slate-400">Last login</p>
            <p className="text-xs font-semibold text-slate-600">{timeAgo(staff.lastLoginAt)}</p>
          </div>

          {/* Expand chevron */}
          <div className="flex-shrink-0 text-slate-400">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {/* Expanded Panel */}
        {expanded && (
          <div className="border-t border-slate-100 p-4 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">

            {/* Role assignment */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Assign Roles</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {ALL_STAFF_ROLES.map(role => {
                  const meta = ROLE_META[role];
                  const active = pendingRoles.includes(role);
                  return (
                    <button
                      key={role}
                      onClick={() => handleToggleRole(role)}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wide border-2 transition-all"
                      style={active
                        ? { borderColor: meta.color, background: meta.bg, color: meta.color }
                        : { borderColor: '#e2e8f0', background: 'white', color: '#94a3b8' }
                      }
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              {/* Printer Category Sub-selection */}
              {pendingRoles.includes('PRINTER') && (
                <div className="mb-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-orange-500 mb-1.5">Printer Machine Type</p>
                  <select
                    value={pendingPrinterCategory || ''}
                    onChange={(e) => setPendingPrinterCategory(e.target.value as PrinterCategory)}
                    className="w-full text-xs font-bold text-slate-700 border-2 border-orange-200 bg-orange-50/50 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 focus:bg-white transition-colors"
                  >
                    <option value="" disabled>Select Machine Type...</option>
                    {ALL_PRINTER_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{PRINTER_CATEGORY_META[cat].label}</option>
                    ))}
                  </select>
                </div>
              )}

              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason for change (optional)"
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 mb-2"
              />
              <button
                onClick={handleSaveRoles}
                disabled={!isDirty || isPending}
                className="flex items-center gap-2 px-4 h-11 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition"
              >
                {isPending ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                Save Roles
              </button>
            </div>

            {/* Status controls */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Account Status</p>
              <div className="flex flex-wrap gap-2">
                {staff.status !== 'ACTIVE' && (
                  <button onClick={() => handleStatus('ACTIVE')} disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition">
                    <UserCheck size={12} /> Activate
                  </button>
                )}
                {staff.status !== 'SUSPENDED' && (
                  <button onClick={() => handleStatus('SUSPENDED')} disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-bold transition">
                    <AlertTriangle size={12} /> Suspend
                  </button>
                )}
                {staff.status !== 'DISABLED' && (
                  <button onClick={() => handleStatus('DISABLED')} disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-xl text-xs font-bold transition">
                    <UserX size={12} /> Disable
                  </button>
                )}
              </div>
            </div>

            {/* Audit history */}
            <div>
              <button
                onClick={() => setShowHistory(v => !v)}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 transition"
              >
                <History size={12} />
                {showHistory ? 'Hide' : 'Show'} Activity History
              </button>
              {showHistory && <HistoryPanel userId={staff.uid} />}
            </div>

          </div>
        )}
      </div>
    </>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StaffManagementPage() {
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<StaffRole | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<StaffStatus | 'ALL'>('ALL');

  const loadStaff = useCallback(async () => {
    setLoading(true);
    const list = await getStaffList();
    setStaffList(list);
    setLoading(false);
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const filtered = staffList.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase());
    const matchRole   = filterRole === 'ALL' || s.roles.includes(filterRole);
    const matchStatus = filterStatus === 'ALL' || s.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  });

  const counts = {
    total: staffList.length,
    active: staffList.filter(s => s.status === 'ACTIVE').length,
    suspended: staffList.filter(s => s.status === 'SUSPENDED').length,
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <div className="max-w-5xl mx-auto space-y-6 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold font-black text-slate-900 uppercase tracking-tight">Staff Management</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Real-time role assignment · Changes apply instantly
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={loadStaff} className="flex items-center gap-2 px-4 h-11 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition shadow-sm">
              <RefreshCw size={12} /> Refresh
            </button>
            <Link href="/admin/staff/new" className="flex items-center gap-2 px-4 h-11 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition shadow-sm">
              <Plus size={14} /> Create Staff
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Staff', value: counts.total, color: 'text-slate-800', icon: Users },
            { label: 'Active',      value: counts.active, color: 'text-emerald-600', icon: CheckCircle2 },
            { label: 'Suspended',   value: counts.suspended, color: 'text-amber-600', icon: AlertTriangle },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                <s.icon size={18} className={s.color} />
              </div>
              <div>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white"
            />
          </div>
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value as any)}
            className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white font-semibold text-slate-700"
          >
            <option value="ALL">All Roles</option>
            {ALL_STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white font-semibold text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>

        {/* Staff List */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={20} /> Loading staff…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Shield size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-semibold">No staff found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(staff => (
              <StaffRow key={staff.uid} staff={staff} onRefresh={loadStaff} />
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
