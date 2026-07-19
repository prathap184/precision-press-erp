'use client';
import { RoleGuard } from '@/lib/role-guard';
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'DISPATCH', 'ACCOUNTANT', 'SUPPORT']}>
      <div className='p-6 space-y-6 h-full'>
        {children}
      </div>
    </RoleGuard>
  );
}
