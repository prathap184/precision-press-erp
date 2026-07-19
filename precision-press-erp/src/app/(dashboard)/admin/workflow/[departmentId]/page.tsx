'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { fetchDepartment } from '@/lib/workflow-analytics';
import { RoleGuard } from '@/lib/role-guard';
import { ArrowLeft, Clock, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Order } from '@/types/models';

// ─── Live Timer Hook ──────────────────────────────────────────────────────────

function useLiveTimer() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000); // tick every minute
    return () => clearInterval(t);
  }, []);
  return tick;
}

function formatElapsed(startTime: string | null): string {
  if (!startTime) return '—';
  const min = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SimpleDepartmentPage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = Array.isArray(params.departmentId) ? params.departmentId[0] : params.departmentId || '';

  const [department, setDepartment] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [completed, setCompleted] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  
  const tick = useLiveTimer();

  const loadData = useCallback(async () => {
    if (!departmentId) return;
    try {
      setLoading(true);
      const dept = await fetchDepartment(departmentId);
      setDepartment(dept);

      if (dept && dept.name) {
        const roleName = dept.name.toUpperCase().trim();
        
        // Fetch recent/active orders from the main orders table
        const { data: orders, error } = await supabase
          .from('orders')
          .select('*')
          .order('createdAt', { ascending: false })
          .limit(200);

        if (!error && orders) {
          const pendingList: any[] = [];
          const completedList: any[] = [];

          orders.forEach((o) => {
            let snap: any = null;
            try {
              snap = typeof o.workflow === 'string' ? JSON.parse(o.workflow) : o.workflow;
            } catch (e) {}

            try {
              if (o.workflowSnapshot && typeof o.workflowSnapshot === 'string') {
                snap = JSON.parse(o.workflowSnapshot);
              } else if (o.workflowSnapshot) {
                snap = o.workflowSnapshot;
              }
            } catch (e) {}

            const isCurrentlyHere = o.currentWorkflowRole === roleName;
            
            let thisStep: any = null;
            if (snap && snap.steps) {
              thisStep = snap.steps.find((s: any) => s.role === roleName);
            }

            // Pending: if currentWorkflowRole is this department
            if (isCurrentlyHere) {
              // Time waiting: usually since the previous step was completed, 
              // or fallback to order updatedAt/createdAt
              let waitingSince = o.updatedAt || o.createdAt;
              pendingList.push({
                ...o,
                waitingSince,
                customer: typeof o.customerSnapshot === 'string' ? JSON.parse(o.customerSnapshot || '{}') : (o.customerSnapshot || {})
              });
            }

            // Completed: if the step in workflowSnapshot exists and is COMPLETED
            if (thisStep && thisStep.status === 'COMPLETED') {
              completedList.push({
                ...o,
                completedAt: thisStep.completedAt,
                customer: typeof o.customerSnapshot === 'string' ? JSON.parse(o.customerSnapshot || '{}') : (o.customerSnapshot || {})
              });
            }
          });

          setPending(pendingList);
          setCompleted(completedList);
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 30_000); // auto refresh every 30s
    return () => clearInterval(t);
  }, [loadData]);

  const deptColor = department?.color || '#3b82f6';

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER']}>
      <div className="min-h-screen bg-slate-50/50 p-4 md:p-6 lg:p-8">
        
        {/* Header */}
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin/workflow')}
              className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            >
              <ArrowLeft size={16} className="text-slate-600" />
            </button>
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm"
                style={{ backgroundColor: deptColor }}
              >
                {department?.name?.[0] || '?'}
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  {department?.name || 'Loading...'}
                </h1>
                <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto mb-6 flex bg-slate-200/50 p-1 rounded-xl w-fit">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'pending' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Clock size={16} className={activeTab === 'pending' ? 'text-blue-500' : ''} />
            Pending Queue
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">
              {pending.length}
            </span>
          </button>
          <button 
            onClick={() => setActiveTab('completed')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'completed' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <CheckCircle2 size={16} className={activeTab === 'completed' ? 'text-green-500' : ''} />
            Completed
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-2">
              {completed.length}
            </span>
          </button>
        </div>

        {/* List Layout */}
        <div className="max-w-7xl mx-auto">
          
          {/* PENDING COLUMN */}
          {activeTab === 'pending' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-blue-500" /> Pending Queue
              </h2>
              <span className="text-xs font-black text-slate-500 bg-slate-200/50 px-2.5 py-0.5 rounded-full">
                {pending.length}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-[75vh] p-4 space-y-3">
              {loading && pending.length === 0 ? (
                <div className="text-center text-slate-400 text-xs py-10">Loading...</div>
              ) : pending.length === 0 ? (
                <div className="text-center text-slate-400 text-sm py-16 flex flex-col items-center">
                  <Clock size={32} className="text-slate-200 mb-2" />
                  Queue is completely empty
                </div>
              ) : (
                pending.map((order) => {
                  return (
                    <div key={order.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-blue-100 hover:shadow-sm transition-all group bg-white">
                      {/* Timer Badge */}
                      <div className="flex flex-col items-center justify-center w-16 h-14 rounded-lg flex-shrink-0 bg-slate-50 text-slate-700 border border-slate-200" suppressHydrationWarning>
                        <span className="text-[10px] uppercase font-bold text-opacity-70 mb-0.5">Wait</span>
                        <span className="text-sm font-black tabular-nums tracking-tighter leading-none">{formatElapsed(order.waitingSince)}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-black text-sm text-slate-800">{order.id}</span>
                          <span className="text-[10px] font-bold text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full truncate">
                            {order.customer?.name || order.customerName || '—'}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 truncate">
                          {order.orderType || '—'} 
                          {order.productName && ` · ${order.productName}`}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="w-full flex items-center justify-center gap-1 text-xs font-black text-white px-4 py-2 rounded-lg opacity-90 hover:opacity-100 transition-opacity"
                          style={{ backgroundColor: deptColor }}
                        >
                          <ExternalLink size={14} /> Open
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          )}

          {/* COMPLETED COLUMN */}
          {activeTab === 'completed' && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" /> Completed
              </h2>
              <span className="text-xs font-black text-slate-500 bg-slate-200/50 px-2.5 py-0.5 rounded-full">
                {completed.length} (Recent)
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-[75vh] p-4 space-y-3">
              {loading && completed.length === 0 ? (
                <div className="text-center text-slate-400 text-xs py-10">Loading...</div>
              ) : completed.length === 0 ? (
                <div className="text-center text-slate-400 text-sm py-16 flex flex-col items-center">
                  <CheckCircle2 size={32} className="text-slate-200 mb-2" />
                  No completed orders yet
                </div>
              ) : (
                completed.map((order) => (
                  <div key={order.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-sm text-slate-500 line-through decoration-slate-300">{order.id}</span>
                        <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          Done
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-400 truncate">
                        {order.customer?.name || order.customerName || '—'} 
                      </p>
                      {order.completedAt && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Finished at {new Date(order.completedAt).toLocaleTimeString()}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="flex items-center justify-center gap-1 text-xs font-black text-slate-600 bg-white px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <ExternalLink size={14} /> Open
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          )}

        </div>
      </div>
      
      {/* Hidden tick to force live timer re-renders */}
      <span className="hidden" aria-hidden>{tick}</span>
    </RoleGuard>
  );
}
