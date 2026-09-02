'use client';
import { RoleGuard } from '@/lib/role-guard';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /admin/orders is the global orders operational hub accessible by staff
  const isGlobalOrders = pathname?.startsWith('/admin/orders');

  return (
    <RoleGuard 
      allowedRoles={isGlobalOrders ? ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER', 'DISPATCH', 'ACCOUNTANT', 'SUPPORT'] : ['ADMIN', 'SUPER_ADMIN']}
      redirectTo="/staff"
    >
      <div className='w-full min-h-full'>
        {children}
      </div>
    </RoleGuard>
  );
}
