'use client';
import { RoleGuard } from '@/lib/role-guard';
export default function PrinterLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['PRINTER', 'ADMIN']}>
      <div className='p-8'>
        <header className='mb-8'>
          <h1 className='text-2xl font-bold text-primary'>Printer Terminal</h1>
          <p className='text-on-surface-variant'>Active print jobs and machine status.</p>
        </header>
        {children}
      </div>
    </RoleGuard>
  );
}
