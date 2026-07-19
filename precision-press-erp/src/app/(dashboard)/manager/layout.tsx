'use client';
import { RoleGuard } from '@/lib/role-guard';
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['MANAGER', 'ADMIN']}>
      <div className='p-8'>
        {children}
      </div>
    </RoleGuard>
  );
}
