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
import { getPrintingCategories, PrintingCategory } from '@/lib/actions/printing-categories';
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
const StaffRow = ({ 
  staff, 
  onRefresh, 
  availableCategories = [] 
}: { 
  staff: StaffUser; 
  onRefresh: () => void; 
  availableCategories?: PrintingCategory[];
}) => {
  const [expanded, setExpanded] = useState(false);
  // Filter out deleted roles (PASTING, FINISHING, FIXING) when initializing
  const validRoles = staff.roles.filter(r => ROLE_META[r]);
  const [pendingRoles, setPendingRoles] = useState<StaffRole[]>(validRoles);

  const initialCategories: string[] = (staff.printerCategories && staff.printerCategories.length > 0)
    ? staff.printerCategories
    : (staff.printerCategory ? staff.printerCategory.split(',').map(s => s.trim()).filter(Boolean) : []);

  const initialSubCategories: string[] = (staff.printerSubCategories && staff.printerSubCategories.length > 0)
    ? staff.printerSubCategories
    : (staff.printerSubCategory ? staff.printerSubCategory.split(',').map(s => s.trim()).filter(Boolean) : []);

  const initialIsMain = initialCategories.includes('MAIN_PRINTER') || (!initialCategories.length && staff.printerCategory === 'MAIN_PRINTER');

  const [isMainPrinter, setIsMainPrinter] = useState<boolean>(initialIsMain);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialIsMain ? [] : initialCategories.filter(c => c !== 'MAIN_PRINTER')
  );
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>(
    initialIsMain ? [] : initialSubCategories
  );

  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<null | { title: string; message: string; action: () => void; danger?: boolean }>(null);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const isRolesDirty = JSON.stringify(pendingRoles.slice().sort()) !== JSON.stringify(staff.roles.slice().sort());
  const isPrinterDirty = pendingRoles.includes('PRINTER') && (
    isMainPrinter !== initialIsMain ||
    JSON.stringify(selectedCategories.slice().sort()) !== JSON.stringify(initialCategories.filter(c => c !== 'MAIN_PRINTER').slice().sort()) ||
    JSON.stringify(selectedSubCategories.slice().sort()) !== JSON.stringify(initialSubCategories.slice().sort())
  );
  const isDirty = isRolesDirty || isPrinterDirty;

  const handleToggleRole = (role: StaffRole) => {
    setPendingRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleToggleCategory = (catName: string) => {
    setIsMainPrinter(false);
    setSelectedCategories(prev => {
      const exists = prev.includes(catName);
      if (exists) {
        // Also remove any subcategories belonging to this category
        const catObj = availableCategories.find(c => c.name === catName || c.id === catName);
        const subNames = (catObj?.subcategories || []).map(s => s.name);
        setSelectedSubCategories(sPrev => sPrev.filter(sn => !subNames.includes(sn)));
        return prev.filter(c => c !== catName);
      } else {
        return [...prev, catName];
      }
    });
  };

  const handleToggleSubCategory = (subName: string, parentCatName: string) => {
    setIsMainPrinter(false);
    // Ensure parent category is also selected
    if (!selectedCategories.includes(parentCatName)) {
      setSelectedCategories(prev => [...prev, parentCatName]);
    }
    setSelectedSubCategories(prev =>
      prev.includes(subName) ? prev.filter(s => s !== subName) : [...prev, subName]
    );
  };

  const handleSelectAllSubCategories = (parentCat: PrintingCategory) => {
    setIsMainPrinter(false);
    if (!selectedCategories.includes(parentCat.name)) {
      setSelectedCategories(prev => [...prev, parentCat.name]);
    }
    const subNames = (parentCat.subcategories || []).map(s => s.name);
    setSelectedSubCategories(prev => Array.from(new Set([...prev, ...subNames])));
  };

  const handleClearSubCategories = (parentCat: PrintingCategory) => {
    const subNames = (parentCat.subcategories || []).map(s => s.name);
    setSelectedSubCategories(prev => prev.filter(s => !subNames.includes(s)));
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
          const targetCategories = isMainPrinter ? ['MAIN_PRINTER'] : selectedCategories;
          const targetSubCategories = isMainPrinter ? [] : selectedSubCategories;
          const res = await updateStaffRoles(
            staff.uid, 
            pendingRoles, 
            reason || undefined,
            pendingRoles.includes('PRINTER') ? targetCategories : undefined,
            pendingRoles.includes('PRINTER') ? targetSubCategories : undefined
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

      <div className="border border-slate-200/80 rounded-2xl bg-white shadow-xs overflow-hidden transition-all hover:border-slate-300">
        {/* Summary row */}
        <div
          onClick={() => setExpanded(v => !v)}
          className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none hover:bg-slate-50/60 transition"
        >
          {/* Avatar / Name */}
          <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center font-bold text-slate-700 text-sm flex-shrink-0">
            {staff.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-900 text-sm">{staff.name}</span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ color: statusCfg.color, background: statusCfg.bg }}
              >
                <StatusIcon size={10} />
                {statusCfg.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">{staff.email}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {staff.roles.map(r => <RoleBadge key={r} role={r} />)}
              {staff.roles.includes('PRINTER') && (
                <div className="flex flex-wrap gap-1 items-center">
                  {staff.printerCategories && staff.printerCategories.length > 0 ? (
                    staff.printerCategories.map(cat => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-orange-200 bg-orange-50 text-orange-700"
                      >
                        {cat === 'MAIN_PRINTER' ? 'Main Printer (All)' : cat}
                      </span>
                    ))
                  ) : (staff.printerCategory ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-orange-200 bg-orange-50 text-orange-700"
                    >
                      {staff.printerCategory === 'MAIN_PRINTER' ? 'Main Printer' : staff.printerCategory}
                      {staff.printerSubCategory ? ` › ${staff.printerSubCategory}` : ''}
                    </span>
                  ) : null)}
                  {staff.printerSubCategories && staff.printerSubCategories.length > 0 && (
                    staff.printerSubCategories.map(sub => (
                      <span
                        key={sub}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border border-purple-200 bg-purple-50 text-purple-700"
                      >
                        › {sub}
                      </span>
                    ))
                  )}
                </div>
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
              <div className="flex flex-wrap gap-1.5 mb-3">
                {ALL_STAFF_ROLES.map(role => {
                  const meta = ROLE_META[role];
                  if (!meta) return null;
                  const active = pendingRoles.includes(role);
                  return (
                    <button
                      key={role}
                      onClick={() => handleToggleRole(role)}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wide border-2 transition-all cursor-pointer"
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

              {/* Multi-Category & Multi-Subcategory Checkbox Boxes */}
              {pendingRoles.includes('PRINTER') && (
                <div className="mb-4 p-4 rounded-2xl border border-orange-200 bg-orange-50/40 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-black uppercase tracking-wider text-orange-700">Printer Machine Stream Assignments</p>
                      <span className="text-[10px] text-orange-600 font-semibold bg-orange-100 px-2 py-0.5 rounded-full">Multi-Selection Enabled</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">Select all production streams and subcategories this printer operator is authorized to handle:</p>
                  </div>

                  {/* Main Printer Checkbox */}
                  <label className="flex items-center gap-3 p-3 rounded-xl border-2 border-purple-200 bg-white hover:bg-purple-50/40 cursor-pointer transition shadow-2xs">
                    <input
                      type="checkbox"
                      checked={isMainPrinter}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsMainPrinter(checked);
                        if (checked) {
                          setSelectedCategories([]);
                          setSelectedSubCategories([]);
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <div>
                      <p className="text-xs font-bold text-purple-900">★ Main Printer (Supervisor – Sees All Orders)</p>
                      <p className="text-[10px] text-slate-400">Enables full unrestricted visibility across all machine streams and all categories.</p>
                    </div>
                  </label>

                  {/* Specific Categories & Subcategories with Checkboxes */}
                  {!isMainPrinter && (
                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Available Production Streams</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {availableCategories.map(cat => {
                          const isCatChecked = selectedCategories.includes(cat.name);
                          const subcats = cat.subcategories || [];
                          const hasSubs = cat.has_subcategories && subcats.length > 0;
                          const selectedSubsCount = subcats.filter(s => selectedSubCategories.includes(s.name)).length;

                          return (
                            <div
                              key={cat.id}
                              className={`p-3 rounded-xl border-2 transition-all ${
                                isCatChecked ? 'border-orange-300 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/60'
                              }`}
                            >
                              {/* Category Checkbox Header */}
                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={isCatChecked}
                                    onChange={() => handleToggleCategory(cat.name)}
                                    className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                                  />
                                  <span className={`text-xs font-bold ${isCatChecked ? 'text-slate-900' : 'text-slate-600'}`}>
                                    {cat.name}
                                  </span>
                                </label>
                                {hasSubs && (
                                  <span className="text-[10px] font-semibold text-slate-400 font-mono">
                                    {selectedSubsCount > 0 ? `${selectedSubsCount}/${subcats.length}` : `${subcats.length} sub-tiers`}
                                  </span>
                                )}
                              </div>

                              {/* Subcategories Checkboxes */}
                              {hasSubs && isCatChecked && (
                                <div className="mt-2.5 pl-6 pt-2 border-t border-slate-100 space-y-1.5 animate-in fade-in duration-150">
                                  <div className="flex items-center justify-between pb-1">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-purple-700">Subcategories</span>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleSelectAllSubCategories(cat)}
                                        className="text-[9px] font-bold text-indigo-600 hover:underline cursor-pointer"
                                      >
                                        Select All
                                      </button>
                                      <span className="text-[9px] text-slate-300">·</span>
                                      <button
                                        type="button"
                                        onClick={() => handleClearSubCategories(cat)}
                                        className="text-[9px] font-bold text-slate-400 hover:underline cursor-pointer"
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    {subcats.map(sub => {
                                      const isSubChecked = selectedSubCategories.includes(sub.name);
                                      return (
                                        <label
                                          key={sub.id}
                                          className="flex items-center gap-2 py-0.5 cursor-pointer select-none hover:text-indigo-600 transition-colors"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isSubChecked}
                                            onChange={() => handleToggleSubCategory(sub.name, cat.name)}
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                          />
                                          <span className={`text-[11px] ${isSubChecked ? 'font-bold text-purple-950' : 'text-slate-600'}`}>
                                            {sub.name}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                className="flex items-center gap-2 px-4 h-11 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition cursor-pointer"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold transition cursor-pointer">
                    <UserCheck size={12} /> Activate
                  </button>
                )}
                {staff.status !== 'SUSPENDED' && (
                  <button onClick={() => handleStatus('SUSPENDED')} disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-bold transition cursor-pointer">
                    <AlertTriangle size={12} /> Suspend
                  </button>
                )}
                {staff.status !== 'DISABLED' && (
                  <button onClick={() => handleStatus('DISABLED')} disabled={isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-xl text-xs font-bold transition cursor-pointer">
                    <UserX size={12} /> Disable
                  </button>
                )}
              </div>
            </div>

            {/* Dedicated Activity Page Link */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <Link
                href={`/admin/staff/${staff.uid}/activity`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm hover:shadow-md cursor-pointer"
              >
                <History size={14} className="text-amber-400" />
                View Full Account Activity History →
              </Link>
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
  const [availableCategories, setAvailableCategories] = useState<PrintingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<StaffRole | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<StaffStatus | 'ALL'>('ALL');

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const hasAutoScrolledRef = React.useRef(false);

  useEffect(() => {
    if (!loading && staffList.length > 0 && !hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;

      const doScroll = () => {
        const toolbarEl = document.getElementById("staff-table-toolbar");
        if (toolbarEl) {
          const topPos = toolbarEl.getBoundingClientRect().top + window.pageYOffset - 75;
          window.scrollTo({ top: Math.max(0, topPos), behavior: "smooth" });
        }
      };

      const t1 = setTimeout(doScroll, 100);
      const t2 = setTimeout(doScroll, 350);

      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loading, staffList]);

  // Alt+Q Shortcut to focus search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'q' || e.key === 'Q') && e.altKey) {
        e.preventDefault();
        const input = searchInputRef.current || (document.getElementById("staff-search-input") as HTMLInputElement | null);
        if (input) {
          input.focus();
          try { input.select(); } catch {}
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    const [list, cats] = await Promise.all([
      getStaffList(),
      getPrintingCategories()
    ]);
    setStaffList(list);
    setAvailableCategories(cats);
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
        <div id="staff-table-toolbar" className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="staff-search-input"
              ref={searchInputRef}
              type="text"
              placeholder="Search staff... (Alt+Q)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  if (search) {
                    setSearch('');
                  } else {
                    e.currentTarget.blur();
                  }
                }
              }}
              className="w-full pl-9 pr-4 h-9 text-xs bg-white border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-all shadow-xs"
            />
          </div>
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value as any)}
            className="h-9 px-3 text-xs border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-700 shadow-xs"
          >
            <option value="ALL">All Roles</option>
            {ALL_STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="h-9 px-3 text-xs border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-700 shadow-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DISABLED">Disabled</option>
          </select>
          {(search !== '' || filterRole !== 'ALL' || filterStatus !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilterRole('ALL');
                setFilterStatus('ALL');
                const toolbarEl = document.getElementById("staff-table-toolbar");
                if (toolbarEl) {
                  const topPos = toolbarEl.getBoundingClientRect().top + window.pageYOffset - 75;
                  window.scrollTo({ top: Math.max(0, topPos), behavior: "smooth" });
                }
                setTimeout(() => {
                  const input = searchInputRef.current || (document.getElementById("staff-search-input") as HTMLInputElement | null);
                  if (input) {
                    try { input.focus({ preventScroll: true }); } catch { input.focus(); }
                  }
                }, 50);
              }}
              className="h-9 px-3 text-xs border border-slate-300 rounded-xl bg-white font-semibold text-slate-600 hover:bg-slate-50 transition shadow-xs flex items-center gap-1"
            >
              <X size={12} /> Clear filters
            </button>
          )}
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
              <StaffRow 
                key={staff.uid} 
                staff={staff} 
                onRefresh={loadStaff} 
                availableCategories={availableCategories} 
              />
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
