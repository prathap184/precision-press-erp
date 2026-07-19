'use client';
import { RoleGuard } from '@/lib/role-guard';
export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['ACCOUNTANT', 'ADMIN']}>
      <div className='p-6'>
        {children}
      </div>
    </RoleGuard>
  );
}
