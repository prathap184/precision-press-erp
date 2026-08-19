'use client';
import { RoleGuard } from '@/lib/role-guard';
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['MANAGER', 'ADMIN']}>
      <div className='w-full min-h-full'>
        {children}
      </div>
    </RoleGuard>
  );
}
