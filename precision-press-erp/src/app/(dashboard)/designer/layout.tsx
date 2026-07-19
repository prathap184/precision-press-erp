'use client';
import { RoleGuard } from '@/lib/role-guard';

export default function DesignerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['DESIGNER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className='p-8 space-y-8 h-full'>
        {children}
      </div>
    </RoleGuard>
  );
}
