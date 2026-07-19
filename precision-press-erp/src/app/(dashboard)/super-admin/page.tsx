'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import Link from 'next/link';
import { 
  Shield, 
  Users, 
  Activity, 
  TrendingUp, 
  Settings, 
  Database,
  Search,
  LayoutGrid
} from 'lucide-react';

export default function SuperAdminDashboard() {
  const { profile } = useAuth();

  return (
    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
      <div className="space-y-4 animate-in fade-in duration-700">
      {/* Header */}
      <section className="flex justify-between items-end bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <p className="text-[9px] font-black text-secondary uppercase tracking-[0.4em] mb-1">Root Authority</p>
          <h1 className="text-[28px] font-bold font-black font-display text-primary tracking-tight leading-none uppercase">System Command Center</h1>
          <p className="text-[10px] text-on-surface-variant font-medium mt-1 opacity-60">
            Global system health and user administration.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="bg-slate-100 border border-slate-200 text-slate-700 px-4 h-11 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Audit Logs</button>
          <Link href="/super-admin/monitoring" className="bg-emerald-600 text-white px-4 h-11 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2">
            <Activity size={14} /> Monitoring
          </Link>
          <button className="bg-primary text-white px-4 h-11 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all">Configure System</button>
        </div>
      </section>

      {/* Global Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'System Uptime', value: '99.9%', icon: Activity, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Active Users', value: '24', icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Global Revenue', value: '₹42,85,920', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Database Status', value: 'Nominal', icon: Database, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between group hover:shadow-md transition-all">
            <div>
               <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-40 mb-1">{stat.label}</p>
               <h3 className="text-lg font-black font-display text-primary tracking-tight uppercase">{stat.value}</h3>
            </div>
            <div className={`p-2.5 rounded-lg ${stat.bg} ${stat.color} transition-transform group-hover:scale-105`}>
              <stat.icon size={18} strokeWidth={2.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 bg-primary text-white rounded-xl border border-slate-900 flex flex-col justify-between min-h-[160px] relative overflow-hidden group">
          <Shield size={100} className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-1000" />
          <div>
            <div className="flex justify-between items-center mb-1">
              <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-secondary">Security Layer</h4>
            </div>
            <h3 className="text-lg font-black font-display tracking-tight leading-tight uppercase">User Authority Control</h3>
            <p className="text-white/60 text-[10px] mt-2 max-w-[200px]">Manage system-wide permissions and onboard new personnel securely.</p>
          </div>
          <button className="bg-white text-primary px-4 h-11 rounded-lg text-[9px] font-black uppercase tracking-widest w-fit mt-4 hover:bg-secondary transition-colors">
            Access Core Directory
          </button>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">System Reliability</h4>
              <span className="text-[8px] font-black text-secondary bg-secondary/10 px-2 py-0.5 rounded uppercase tracking-tighter">Automated Monitoring</span>
            </div>
            <div className="space-y-1">
              {[
                { label: 'Firebase Real-time', val: 'Low Latency' },
                { label: 'Cloud Storage', val: '42.8 GB / 50 GB' },
                { label: 'Auth Protocols', val: 'Shield v2.4 Active' },
              ].map((row, idx) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0 text-[10px]">
                  <span className="font-black text-on-surface-variant opacity-40 uppercase tracking-widest">{row.label}</span>
                  <span className="font-black text-primary uppercase">{row.val}</span>
                </div>
              ))}
            </div>
          </div>
          <button className="w-full mt-4 h-11 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-black text-primary uppercase tracking-widest hover:bg-slate-100 transition-all">
            Full System Diagnostic
          </button>
        </div>
      </div>
    </div>
    </RoleGuard>
  );
}
