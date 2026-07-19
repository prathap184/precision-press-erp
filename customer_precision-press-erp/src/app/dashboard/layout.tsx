'use client';

import { useState, Suspense } from 'react';
import { CustomerRoleGuard } from '@/lib/role-guard';
import { CustomerSidebar } from '@/components/layout/customer-sidebar';
import { Header } from '@/components/layout/Header';
import { Toaster } from 'react-hot-toast';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  return (
    <CustomerRoleGuard>
      <Suspense fallback={null}>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            success: { style: { background: '#22c55e', color: '#fff', fontWeight: 'bold' } },
            error: { style: { background: '#ef4444', color: '#fff', fontWeight: 'bold' }, duration: 6000 },
          }}
        />
        <div className="min-h-screen bg-[#f8f9fa] font-sans antialiased text-slate-900 relative overflow-x-clip">
          {/* Minimal Light Grid Background */}
          <div className="fixed inset-0 pointer-events-none select-none z-0" aria-hidden="true">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(circle, #e2e8f0 1.5px, transparent 1.5px)`,
                backgroundSize: '32px 32px',
              }}
            />
            {/* Very faint soft glow in the top center for elegance */}
            <div
              className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-[0.4]"
              style={{
                background: 'radial-gradient(circle at center, rgba(66,133,244,0.08) 0%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />
          </div>
          
          <CustomerSidebar isExpanded={isSidebarExpanded} onToggle={() => setIsSidebarExpanded(!isSidebarExpanded)} />
          <div className={`relative z-10 flex flex-col min-h-screen transition-all duration-300 ${isSidebarExpanded ? 'pl-[280px]' : 'pl-[72px]'}`}>
            <Header />
            <main className={`flex-1 p-4 lg:p-6 w-full text-slate-900`}>
              {children}
            </main>
          </div>
        </div>
      </Suspense>
    </CustomerRoleGuard>
  );
}
