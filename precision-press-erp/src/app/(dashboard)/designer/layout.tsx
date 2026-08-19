'use client';
import { RoleGuard } from '@/lib/role-guard';

export default function DesignerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['DESIGNER', 'ADMIN', 'SUPER_ADMIN', 'ACDEMA', 'MANAGER']}>
      <div className='w-full min-h-full'>
        {children}
      </div>
    </RoleGuard>
  );
}
