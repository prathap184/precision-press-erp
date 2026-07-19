'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { Settings, User, Bell, Shield, Paintbrush } from 'lucide-react';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';

export default function SettingsPage() {
  const { profile } = useAuth();

  return (
    <RoleGuard allowedRoles={['CUSTOMER', 'ADMIN', 'SUPER_ADMIN', 'PRINTER', 'MANAGER', 'ACDEMA', 'ACCOUNTANT', 'DISPATCH', 'DELIVERY']}>
      <div className="space-y-4 animate-in fade-in duration-700">
        <header className="bg-white p-4 rounded border border-slate-200">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
             <Settings size={16} />
             <span className="text-xs font-bold uppercase tracking-wider">System Configuration</span>
          </div>
          <h1 className="text-[28px] font-bold font-bold text-slate-800">Settings</h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Profile Card */}
          <section className="bg-white rounded p-4 border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white">
                <User size={16} />
              </div>
              <h2 className="text-sm font-bold text-slate-800">Account Profile</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Full Name</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{profile?.name || 'Loading...'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Designation</p>
                <p className="text-sm font-bold text-indigo-600 uppercase mt-0.5">{profile?.role || 'User'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact Email</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{profile?.email || '...'}</p>
              </div>
            </div>
          </section>

          {/* Preferences Grid */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {[
                 { icon: Bell, label: 'Notifications', desc: 'Manage email and system alerts' },
                 { icon: Shield, label: 'Security', desc: 'Password and authentication settings' },
                 { icon: Paintbrush, label: 'Appearance', desc: 'System brightness and UI theme' },
                 { icon: Settings, label: 'Integrations', desc: 'Connect third-party logistics apps' }
               ].map((item, i) => (
                 <button key={i} className="flex items-center gap-4 p-4 bg-white rounded border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 transition-all text-left">
                   <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-all shrink-0">
                     <item.icon size={18} />
                   </div>
                   <div>
                     <h3 className="text-sm font-bold text-slate-800">{item.label}</h3>
                     <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                   </div>
                 </button>
               ))}
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
