'use client';

import { useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AuthProvider } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/Sidebar";
import { ShortcutMenu } from "@/components/layout/ShortcutMenu";
import { Header } from "@/components/layout/Header";
import { RoleGuard } from "@/lib/role-guard";
import { Toaster } from "react-hot-toast";
import { CreateDrawerProvider } from "@/components/dashboard/create-drawer";

import { ImpersonationProvider } from "@/lib/impersonation-context";
import { useAuth } from "@/lib/auth-context";

export const dynamic = 'force-dynamic';

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const { user } = useAuth();

  const isGlobalOrdersPage = pathname === '/admin/orders';
  const isAcdemaViewPage = pathname === '/acdema' || pathname === '/acdema/orders' || pathname.startsWith('/pasting') || pathname.startsWith('/finishing');
  const isAccountantLedgerPage = pathname.startsWith('/accountant/ledger');
  const isDesignerWorkspacePage = pathname.startsWith('/designer/orders');
  const isManagerWorkspacePage = pathname.startsWith('/manager/orders');
  const isPrinterWorkspacePage = pathname.startsWith('/printer/orders') || pathname === '/printer';
  const isProxyOrderPage = pathname.startsWith('/proxy-order') || pathname.startsWith('/admin/orders/proxy') || pathname.startsWith('/acdema');
  const isAccountingDashboard = pathname.startsWith('/accounting');
  const displaySidebarExpanded = (isGlobalOrdersPage || isAcdemaViewPage || isAccountantLedgerPage || isDesignerWorkspacePage || isManagerWorkspacePage || isPrinterWorkspacePage || isProxyOrderPage || isAccountingDashboard) ? false : isSidebarExpanded;
  const mainPadding = (isGlobalOrdersPage || isAcdemaViewPage) ? 'p-2.5 md:p-3.5' : isAccountantLedgerPage ? 'p-3 lg:p-4' : 'p-4 lg:p-6';

  return (
    <RoleGuard allowedRoles={['ADMIN', 'CUSTOMER', 'DESIGNER', 'SUPER_ADMIN', 'PRINTER', 'MANAGER', 'ACCOUNTANT', 'DISPATCH', 'SUPPORT', 'DELIVERY', 'ACDEMA', 'PASTING', 'FINISHING']}>
      <ImpersonationProvider adminUid={user?.uid || null}>
        <Suspense fallback={null}>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              success: { style: { background: '#22c55e', color: '#fff', fontWeight: 'bold' } },
              error: { style: { background: '#ef4444', color: '#fff', fontWeight: 'bold' }, duration: 6000 },
            }}
          />
          <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900 relative overflow-x-clip">
          {/* Decorative Layers omitted for brevity in summary, but kept in code */}
          <div className="fixed inset-0 pointer-events-none select-none z-0" aria-hidden="true">
            <div
              className="absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage: `radial-gradient(circle, #c7d2fe 1px, transparent 1px)`,
                backgroundSize: '28px 28px',
              }}
            />
            <div
              className="absolute -top-64 -left-64 w-[700px] h-[700px] rounded-full"
              style={{
                background: 'radial-gradient(circle at center, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.06) 45%, transparent 70%)',
                animation: 'drift1 18s ease-in-out infinite alternate',
              }}
            />
            <div
              className="absolute -bottom-48 -right-48 w-[600px] h-[600px] rounded-full"
              style={{
                background: 'radial-gradient(circle at center, rgba(20,184,166,0.10) 0%, rgba(6,182,212,0.05) 50%, transparent 70%)',
                animation: 'drift2 22s ease-in-out infinite alternate',
              }}
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full opacity-[0.04]"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)',
                filter: 'blur(80px)',
              }}
            />
            <svg
              className="absolute top-0 right-0 w-96 h-96 opacity-[0.06]"
              viewBox="0 0 400 400"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line x1="400" y1="0" x2="0" y2="400" stroke="#1e3a8a" strokeWidth="1.5"/>
              <line x1="440" y1="0" x2="40" y2="400" stroke="#1e3a8a" strokeWidth="1"/>
              <line x1="480" y1="0" x2="80" y2="400" stroke="#1e3a8a" strokeWidth="0.75"/>
              <line x1="360" y1="0" x2="-40" y2="400" stroke="#1e3a8a" strokeWidth="1"/>
              <line x1="320" y1="0" x2="-80" y2="400" stroke="#1e3a8a" strokeWidth="0.75"/>
            </svg>
            <svg
              className="absolute bottom-8 left-24 w-32 h-32 opacity-[0.08]"
              viewBox="0 0 120 120"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M10 110 L10 10 L110 10" stroke="#00236f" strokeWidth="3" strokeLinecap="round"/>
              <path d="M30 110 L30 30 L110 30" stroke="#00236f" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <style>{`
            @keyframes drift1 {
              0%   { transform: translate(0, 0) scale(1); }
              100% { transform: translate(40px, 30px) scale(1.08); }
            }
            @keyframes drift2 {
              0%   { transform: translate(0, 0) scale(1); }
              100% { transform: translate(-30px, -20px) scale(1.06); }
            }
          `}</style>
          <CreateDrawerProvider>
            <ShortcutMenu />
            <Sidebar isExpanded={displaySidebarExpanded} onToggle={() => setIsSidebarExpanded(!isSidebarExpanded)} />
            <div className={`relative z-10 flex flex-col min-h-screen transition-all duration-300 ${displaySidebarExpanded ? 'pl-[280px]' : 'pl-[72px]'}`}>
              <Header />
              <main className={`flex-1 ${mainPadding} w-full text-slate-900`}>
                {children}
              </main>
            </div>
          </CreateDrawerProvider>
        </div>
        </Suspense>
      </ImpersonationProvider>
    </RoleGuard>
  );
}
