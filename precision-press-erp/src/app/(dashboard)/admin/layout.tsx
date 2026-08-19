'use client';
import { RoleGuard } from '@/lib/role-guard';
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'DISPATCH', 'ACCOUNTANT', 'SUPPORT']}>
      <div className='w-full min-h-full'>
        {children}
      </div>
    </RoleGuard>
  );
}
