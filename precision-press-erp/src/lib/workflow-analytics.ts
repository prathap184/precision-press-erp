/**
 * workflow-analytics.ts — v2 Enterprise Edition
 * ───────────────────────────────────────────────
 * SQL-first data fetching for Department Analytics Dashboard.
 * All heavy aggregation runs in Supabase. Browser handles timers and formatting only.
 */

import { supabase } from '@/lib/supabase';

export type TimeRange = 'today' | 'yesterday' | 'week' | 'month' | 'year';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

// ─── Date Helpers ─────────────────────────────────────────────────────────────

export function getDateRange(range: TimeRange): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (range) {
    case 'today': {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { from, to };
    }
    case 'yesterday': {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const toEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { from, to: toEnd };
    }
    case 'week': {
      return { from: new Date(Date.now() - 7 * 86400_000).toISOString(), to };
    }
    case 'month': {
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to };
    }
    case 'year': {
      return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to };
    }
  }
}

// ─── Department Info ──────────────────────────────────────────────────────────

export async function fetchDepartment(departmentId: string) {
  const { data, error } = await supabase
    .from('workflow_departments')
    .select('*')
    .eq('id', departmentId)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDepartmentSettings(departmentId: string) {
  const { data } = await supabase
    .from('workflow_department_settings')
    .select('*')
    .eq('department_id', departmentId)
    .single();
  return data;
}

// ─── Workflow Home — Summary per department (lightweight) ─────────────────────

export interface DeptSummary {
  id: string;
  name: string;
  color: string;
  icon: string;
  sla_minutes: number;
  activeCount: number;
  overdueCount: number;
  completedToday: number;
  slaBreachRate: number; // 0–100 %
  health: 'good' | 'warning' | 'critical';
  maxQueue: number;
}

export async function fetchWorkflowHomeSummary(): Promise<DeptSummary[]> {
  const [deptRes, ordersRes, settingsRes] = await Promise.all([
    supabase.from('workflow_departments').select('*').order('display_order'),
    supabase.from('orders').select('id, currentWorkflowRole, workflowSnapshot, createdAt, updatedAt'),
    supabase.from('workflow_department_settings').select('department_id, max_queue'),
  ]);

  const departments = deptRes.data || [];
  const orders = ordersRes.data || [];
  const settingsRows = settingsRes.data || [];

  return departments.map((dept: any) => {
    const roleName = dept.name?.toUpperCase().trim();
    const settings = settingsRows.find((s: any) => s.department_id === dept.id);
    
    const active = orders.filter((o: any) => o.currentWorkflowRole === roleName);
    
    let completedToday = 0;
    orders.forEach((o: any) => {
      try {
        const snap = typeof o.workflowSnapshot === 'string' ? JSON.parse(o.workflowSnapshot) : o.workflowSnapshot;
        if (snap?.steps) {
          const step = snap.steps.find((s: any) => s.role === roleName);
          if (step && step.status === 'COMPLETED') completedToday++;
        }
      } catch(e) {}
    });

    const overdueCount = active.filter((o: any) => {
      const sla = dept.sla_minutes || 120;
      return Math.floor((Date.now() - new Date(o.updatedAt || o.createdAt).getTime()) / 60000) > sla;
    }).length;

    const maxQueue = settings?.max_queue || 0;
    const queueFill = maxQueue > 0 ? active.length / maxQueue : 0;
    const slaBreachRate = 0; // Keeping 0 for now as SLA tracking is simplified

    let health: 'good' | 'warning' | 'critical' = 'good';
    if (overdueCount > 0 || slaBreachRate > 30 || queueFill > 0.9) health = 'critical';
    else if (slaBreachRate > 10 || queueFill > 0.7) health = 'warning';

    return {
      id: dept.id,
      name: dept.name,
      color: dept.color || '#3b82f6',
      icon: dept.icon || 'Layers',
      sla_minutes: dept.sla_minutes || 120,
      activeCount: active.length,
      overdueCount,
      completedToday,
      slaBreachRate,
      health,
      maxQueue,
    };
  });
}

// ─── Active Queue with Filters ────────────────────────────────────────────────

export interface QueueFilters {
  search?: string;
  priority?: Priority | '';
  viewMode?: 'parent' | 'child' | 'all';
}

export async function fetchActiveQueue(departmentId: string, filters?: QueueFilters) {
  let query = supabase
    .from('workflow_stage_history')
    .select('*')
    .eq('department_id', departmentId)
    .is('exited_at', null)
    .order('queue_position', { ascending: true })
    .order('entered_at', { ascending: true });

  if (filters?.priority) query = query.eq('priority', filters.priority);

  const { data, error } = await query;
  if (error) throw error;

  let rows = data || [];

  // Client-side filter for search (order ID or customer name)
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (r: any) =>
        r.parent_order_id?.toLowerCase().includes(q) ||
        r.child_order_id?.toLowerCase().includes(q) ||
        r.snapshot?.customerName?.toLowerCase().includes(q)
    );
  }

  // View mode: parent-only (no child_order_id), child-only, or all
  if (filters?.viewMode === 'parent') rows = rows.filter((r: any) => !r.child_order_id);
  if (filters?.viewMode === 'child') rows = rows.filter((r: any) => !!r.child_order_id);

  return rows;
}

// ─── KPI Overview ─────────────────────────────────────────────────────────────

export interface DepartmentKPIs {
  ordersWaiting: number;
  ordersCompleted: number;
  ordersCompletedToday: number;
  ordersCompletedWeek: number;
  ordersCompletedMonth: number;
  avgProcessingMinutes: number;
  avgWaitingMinutes: number;
  longestWaitingMinutes: number;
  oldestJobEnteredAt: string | null;
  newestJobEnteredAt: string | null;
  slaBreachers: number;
  slaCompliant: number;
  overdue: number;
  reworkCount: number;
  rejectedCount: number;
  queueLength: number;
}

export async function fetchDepartmentKPIs(departmentId: string): Promise<DepartmentKPIs> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(Date.now() - 7 * 86400_000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [activeRes, cTodayRes, cWeekRes, cMonthRes, cTotalRes, avgRes, slaRes] = await Promise.all([
    supabase.from('workflow_stage_history').select('id,entered_at,sla_status,is_rework,is_rejected,sla_target_minutes').eq('department_id', departmentId).is('exited_at', null),
    supabase.from('workflow_stage_history').select('id', { count: 'exact', head: true }).eq('department_id', departmentId).not('exited_at', 'is', null).gte('exited_at', todayStart),
    supabase.from('workflow_stage_history').select('id', { count: 'exact', head: true }).eq('department_id', departmentId).not('exited_at', 'is', null).gte('exited_at', weekStart),
    supabase.from('workflow_stage_history').select('id', { count: 'exact', head: true }).eq('department_id', departmentId).not('exited_at', 'is', null).gte('exited_at', monthStart),
    supabase.from('workflow_stage_history').select('id', { count: 'exact', head: true }).eq('department_id', departmentId).not('exited_at', 'is', null),
    supabase.from('workflow_stage_history').select('duration_minutes').eq('department_id', departmentId).not('exited_at', 'is', null).not('duration_minutes', 'is', null).gte('exited_at', monthStart),
    supabase.from('workflow_stage_history').select('sla_status').eq('department_id', departmentId).not('exited_at', 'is', null).gte('exited_at', monthStart),
  ]);

  const active = activeRes.data || [];
  const durations = (avgRes.data || []).map((r: any) => r.duration_minutes).filter(Boolean);
  const avgProcessingMinutes = durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : 0;
  const slaBreachers = (slaRes.data || []).filter((r: any) => r.sla_status === 'BREACHED').length;
  const slaCompliant = (slaRes.data || []).filter((r: any) => r.sla_status === 'MET').length;
  const reworkCount = active.filter((r: any) => r.is_rework).length;
  const rejectedCount = active.filter((r: any) => r.is_rejected).length;
  const waitingMinutes = active.map((r: any) => Math.floor((Date.now() - new Date(r.entered_at).getTime()) / 60000));
  const avgWaitingMinutes = waitingMinutes.length > 0 ? Math.round(waitingMinutes.reduce((a: number, b: number) => a + b, 0) / waitingMinutes.length) : 0;
  const longestWaitingMinutes = waitingMinutes.length > 0 ? Math.max(...waitingMinutes) : 0;
  const overdue = active.filter((r: any) => r.sla_target_minutes && Math.floor((Date.now() - new Date(r.entered_at).getTime()) / 60000) > r.sla_target_minutes).length;
  const sorted = [...active].sort((a: any, b: any) => new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime());

  return {
    ordersWaiting: active.length, ordersCompleted: cTotalRes.count || 0,
    ordersCompletedToday: cTodayRes.count || 0, ordersCompletedWeek: cWeekRes.count || 0,
    ordersCompletedMonth: cMonthRes.count || 0, avgProcessingMinutes, avgWaitingMinutes,
    longestWaitingMinutes, oldestJobEnteredAt: sorted[0]?.entered_at || null,
    newestJobEnteredAt: sorted[sorted.length - 1]?.entered_at || null,
    slaBreachers, slaCompliant, overdue, reworkCount, rejectedCount, queueLength: active.length,
  };
}

// ─── Volume Chart ─────────────────────────────────────────────────────────────

export interface VolumePoint { label: string; completed: number; entered: number; }

export async function fetchVolumeByDay(departmentId: string, days = 14): Promise<VolumePoint[]> {
  const from = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('workflow_stage_history').select('entered_at, exited_at')
    .eq('department_id', departmentId).gte('entered_at', from).order('entered_at');
  if (error) throw error;
  const dayMap: Record<string, { completed: number; entered: number }> = {};
  (data || []).forEach((row: any) => {
    const day = row.entered_at.slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { completed: 0, entered: 0 };
    dayMap[day].entered++;
    if (row.exited_at) {
      const exitDay = row.exited_at.slice(0, 10);
      if (!dayMap[exitDay]) dayMap[exitDay] = { completed: 0, entered: 0 };
      dayMap[exitDay].completed++;
    }
  });
  return Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({
    label: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), ...counts,
  }));
}

// ─── Hourly Volume (today) ────────────────────────────────────────────────────

export interface HourlyPoint { hour: string; entered: number; completed: number; }

export async function fetchVolumeByHour(departmentId: string): Promise<HourlyPoint[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('workflow_stage_history').select('entered_at, exited_at')
    .eq('department_id', departmentId).gte('entered_at', todayStart.toISOString());
  if (error) throw error;

  const hourMap: Record<string, { entered: number; completed: number }> = {};
  for (let h = 0; h < 24; h++) {
    const key = `${String(h).padStart(2, '0')}:00`;
    hourMap[key] = { entered: 0, completed: 0 };
  }
  (data || []).forEach((row: any) => {
    const h = new Date(row.entered_at).getHours();
    const key = `${String(h).padStart(2, '0')}:00`;
    hourMap[key].entered++;
    if (row.exited_at) {
      const eh = new Date(row.exited_at).getHours();
      const ekey = `${String(eh).padStart(2, '0')}:00`;
      hourMap[ekey].completed++;
    }
  });
  return Object.entries(hourMap)
    .filter(([h]) => parseInt(h) <= new Date().getHours())
    .map(([hour, v]) => ({ hour, ...v }));
}

// ─── Processing Time Trend ────────────────────────────────────────────────────

export interface ProcessingTrendPoint { label: string; avgMinutes: number; slaTarget: number; minMinutes: number; maxMinutes: number; }

export async function fetchProcessingTimeTrend(departmentId: string, slaMinutes: number, days = 14): Promise<ProcessingTrendPoint[]> {
  const from = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('workflow_stage_history').select('exited_at, duration_minutes')
    .eq('department_id', departmentId).not('exited_at', 'is', null).not('duration_minutes', 'is', null)
    .gte('exited_at', from).order('exited_at');
  if (error) throw error;
  const dayMap: Record<string, number[]> = {};
  (data || []).forEach((row: any) => {
    const day = row.exited_at.slice(0, 10);
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push(row.duration_minutes);
  });
  return Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, mins]) => ({
    label: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    avgMinutes: Math.round(mins.reduce((a, b) => a + b, 0) / mins.length),
    minMinutes: Math.min(...mins),
    maxMinutes: Math.max(...mins),
    slaTarget: slaMinutes,
  }));
}

// ─── Queue Depth Trend (approximated from entered/exited timestamps) ──────────

export interface QueueDepthPoint { label: string; depth: number; }

export async function fetchQueueDepthTrend(departmentId: string, days = 14): Promise<QueueDepthPoint[]> {
  const from = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('workflow_stage_history').select('entered_at, exited_at')
    .eq('department_id', departmentId).gte('entered_at', from);
  if (error) throw error;

  const dayMap: Record<string, number> = {};
  const baseDate = new Date(from);
  for (let d = 0; d <= days; d++) {
    const dt = new Date(baseDate.getTime() + d * 86400_000);
    dayMap[dt.toISOString().slice(0, 10)] = 0;
  }

  (data || []).forEach((row: any) => {
    const enterDay = row.entered_at.slice(0, 10);
    const exitDay = row.exited_at ? row.exited_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
    Object.keys(dayMap).forEach((d) => {
      if (d >= enterDay && d <= exitDay) dayMap[d]++;
    });
  });

  return Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, depth]) => ({
    label: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    depth,
  }));
}

// ─── Priority Distribution ────────────────────────────────────────────────────

export interface PriorityPoint { name: string; value: number; color: string; }

export async function fetchPriorityDistribution(departmentId: string): Promise<PriorityPoint[]> {
  const { data, error } = await supabase
    .from('workflow_stage_history').select('priority').eq('department_id', departmentId).is('exited_at', null);
  if (error) throw error;
  const counts: Record<string, number> = { LOW: 0, NORMAL: 0, HIGH: 0, URGENT: 0 };
  (data || []).forEach((r: any) => { const p = r.priority || 'NORMAL'; counts[p] = (counts[p] || 0) + 1; });
  const colorMap: Record<string, string> = { LOW: '#94a3b8', NORMAL: '#3b82f6', HIGH: '#f59e0b', URGENT: '#ef4444' };
  return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, color: colorMap[name] }));
}

// ─── SLA Compliance ───────────────────────────────────────────────────────────

export async function fetchSLACompliance(departmentId: string): Promise<{ name: string; value: number; color: string }[]> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data, error } = await supabase
    .from('workflow_stage_history').select('sla_status').eq('department_id', departmentId)
    .not('exited_at', 'is', null).gte('exited_at', monthStart);
  if (error) throw error;
  const met = (data || []).filter((r: any) => r.sla_status === 'MET').length;
  const breached = (data || []).filter((r: any) => r.sla_status === 'BREACHED').length;
  const unknown = (data || []).filter((r: any) => !r.sla_status || r.sla_status === 'PENDING').length;
  return [
    { name: 'Met SLA', value: met, color: '#10b981' },
    { name: 'Breached', value: breached, color: '#ef4444' },
    { name: 'Pending', value: unknown, color: '#94a3b8' },
  ].filter((d) => d.value > 0);
}

// ─── Completed History (SQL-paginated) ───────────────────────────────────────

export interface CompletedFilters {
  search?: string;
  priority?: Priority | '';
  slaStatus?: 'MET' | 'BREACHED' | '';
}

export async function fetchCompletedHistory(
  departmentId: string,
  range: TimeRange | { from: string; to: string },
  page = 0,
  pageSize = 25,
  filters?: CompletedFilters
) {
  const { from, to } = typeof range === 'string' ? getDateRange(range) : range;

  let query = supabase
    .from('workflow_stage_history')
    .select('*', { count: 'exact' })
    .eq('department_id', departmentId)
    .not('exited_at', 'is', null)
    .gte('exited_at', from)
    .lte('exited_at', to)
    .order('exited_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (filters?.priority) query = query.eq('priority', filters.priority);
  if (filters?.slaStatus) query = query.eq('sla_status', filters.slaStatus);

  const { data, error, count } = await query;
  if (error) throw error;

  let rows = data || [];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (r: any) =>
        r.parent_order_id?.toLowerCase().includes(q) ||
        r.snapshot?.customerName?.toLowerCase().includes(q)
    );
  }
  return { rows, total: count || 0 };
}

// ─── KPI Drill-down ──────────────────────────────────────────────────────────

export type DrilldownType = 'overdue' | 'waiting' | 'rework' | 'breached';

export async function fetchKPIDrilldown(departmentId: string, type: DrilldownType) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  if (type === 'overdue' || type === 'waiting') {
    const { data } = await supabase
      .from('workflow_stage_history').select('*')
      .eq('department_id', departmentId).is('exited_at', null).order('entered_at');
    const rows = data || [];
    if (type === 'overdue') return rows.filter((r: any) => r.sla_target_minutes && Math.floor((Date.now() - new Date(r.entered_at).getTime()) / 60000) > r.sla_target_minutes);
    return rows;
  }
  if (type === 'rework') {
    const { data } = await supabase.from('workflow_stage_history').select('*').eq('department_id', departmentId).eq('is_rework', true).is('exited_at', null);
    return data || [];
  }
  if (type === 'breached') {
    const { data } = await supabase.from('workflow_stage_history').select('*').eq('department_id', departmentId).eq('sla_status', 'BREACHED').gte('exited_at', monthStart);
    return data || [];
  }
  return [];
}

// ─── CSV Export Helper ────────────────────────────────────────────────────────

export function exportToCSV(rows: any[], filename: string, columns: { key: string; label: string }[]) {
  const header = columns.map((c) => c.label).join(',');
  const body = rows.map((row) =>
    columns.map((c) => {
      const val = c.key.split('.').reduce((obj, k) => obj?.[k], row) ?? '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...body].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
