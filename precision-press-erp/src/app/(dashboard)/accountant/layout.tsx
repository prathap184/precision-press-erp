'use client';
import { RoleGuard } from '@/lib/role-guard';
export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/staff">
      <div className='w-full min-h-full'>
        {children}
      </div>
    </RoleGuard>
  );
}
