'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, Activity, Clock } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { WorkflowPipelineVisual } from '@/components/orders/WorkflowPipelineVisual';

export default function OrderLedgerPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!orderId) return;

    let mounted = true;
    const fetchLedger = async () => {
      setLoading(true);
      try {
        // Fetch order to get account name, dispatch method, and workflow snapshot
        const { data: orderData } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();
        
        if (orderData && mounted) {
          setOrder(orderData);
        }

        // Fetch activity logs
        const { data: logsList } = await supabase
          .from('activity_logs')
          .select('*')
          .or(`meta->>orderId.eq.${orderId}`);
        
        if (logsList && mounted) {
          const sortedLogs = [...logsList].sort((a: any, b: any) => {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          });
          setLogs(sortedLogs);
        }

        // Fetch staff names from 'profiles' to map UIDs
        const { data: profileList } = await supabase
          .from('profiles')
          .select('id, uid, name, displayName');
          
        if (profileList && mounted) {
          const sMap: Record<string, string> = {};
          profileList.forEach((p: any) => {
            const userId = p.uid || p.id;
            sMap[userId] = p.displayName || p.name;
          });
          setStaffMap(sMap);
        }
      } catch (err) {
        console.error('Failed to fetch ledger:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchLedger();

    return () => {
      mounted = false;
    };
  }, [orderId]);

  const dispatchMethod = order?.delivery?.choice || order?.dispatchInfo?.method || 'N/A';
  const customerName = order?.customerSnapshot?.displayName || order?.customerSnapshot?.name || 'Unknown Account';
  
  const formatLogDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(new Date(dateStr));
    } catch {
      return '—';
    }
  };

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'SUPPORT']}>
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Header & Back Button */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push('/admin/orders')}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-900 hover:text-white transition-colors shadow-sm"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Order #{orderId.replace('ORD-', '')}</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Order Journey & Activity Ledger</p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Order Ledger...</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Flow Diagram / Pipeline */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-6">
                  <Activity size={18} className="text-indigo-600" />
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Workflow Pipeline</h2>
                </div>
                <WorkflowPipelineVisual 
                  snapshot={order?.workflowSnapshot} 
                  orderId={orderId} 
                  detailed={true} 
                  filterByRoles={true} 
                  allowNavigation={false} 
                />
              </div>

              {/* Detailed Stage History */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-8">
                  <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest italic">
                    Stage-by-Stage Working History
                  </h2>
                </div>

                <div className="space-y-2">
                  {order?.workflowSnapshot?.steps?.map((step: any, index: number) => {
                    
                    // Attempt to find the specific actor from logs based on the step's role and completion
                    // We look for logs that match this role to find who actually did the work.
                    const stepLogs = logs.filter(l => l.userRole === step.role || l.action?.includes(step.role));
                    const latestLog = stepLogs[0]; // Since logs are sorted newest first

                    // Try to get name from staffMap using completedBy UID, fallback to logs, then role
                    let actorName = '';
                    if (step.completedBy && staffMap[step.completedBy]) {
                      actorName = staffMap[step.completedBy];
                    } else if (latestLog?.userName) {
                      actorName = latestLog.userName;
                    } else if (latestLog?.userEmail) {
                      actorName = latestLog.userEmail.split('@')[0];
                    } else {
                      actorName = step.role; // Better to show the role than a UUID
                    }
                    
                    const actionTime = step.completedAt || latestLog?.timestamp;
                    
                    return (
                      <div key={index} className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${step.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : step.status === 'IN_PROGRESS' ? 'bg-blue-50 border-blue-500 text-blue-600 animate-pulse' : 'bg-slate-50 border-slate-200 text-slate-300'}`}>
                            <span className="text-[10px] font-black">{index + 1}</span>
                          </div>
                          {index < (order.workflowSnapshot?.steps?.length || 0) - 1 && (
                            <div className={`w-0.5 min-h-[60px] my-1 ${step.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-slate-100'}`} />
                          )}
                        </div>
                        
                        <div className="pt-1 pb-4 flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-black text-slate-900 tracking-tight">{step.label}</h3>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{step.role}</p>
                            </div>
                            <div className="text-right">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${step.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : step.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                {step.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>

                          {/* Show who worked on it if it's completed or in progress */}
                          {(step.status === 'COMPLETED' || step.status === 'IN_PROGRESS') && (
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <div className="inline-flex items-center gap-2.5 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
                                <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black uppercase">
                                  {actorName.charAt(0)}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">
                                    {step.status === 'COMPLETED' ? 'Completed By' : 'Currently Worked By'}
                                  </span>
                                  <span className="text-xs font-black text-slate-900 leading-none">{actorName}</span>
                                </div>
                              </div>
                              
                              {actionTime && (
                                <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50/50 rounded-xl border border-slate-100">
                                  <Clock size={12} className="text-slate-400" />
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">
                                      {step.status === 'COMPLETED' ? 'Completion Time' : 'Last Updated'}
                                    </span>
                                    <span className="text-xs font-bold text-slate-600 leading-none">{formatLogDate(actionTime)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
