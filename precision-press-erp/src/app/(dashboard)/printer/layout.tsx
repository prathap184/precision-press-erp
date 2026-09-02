'use client';
import { RoleGuard } from '@/lib/role-guard';
import { usePathname } from 'next/navigation';

export default function PrinterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetailPage = pathname?.startsWith('/printer/orders');

  return (
    <RoleGuard allowedRoles={['PRINTER', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/staff">
      <div className='w-full min-h-full'>
        {!isDetailPage && (
          <header className='mb-8 px-8 pt-8'>
            <h1 className='text-2xl font-bold text-primary'>Printer Terminal</h1>
            <p className='text-on-surface-variant'>Active print jobs and machine status.</p>
          </header>
        )}
        {children}
      </div>
    </RoleGuard>
  );
}
