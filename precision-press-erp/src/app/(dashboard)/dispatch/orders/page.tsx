'use client';
import { RoleGuard } from '@/lib/role-guard';
import { RoleGlobalOrdersPage } from '@/components/orders/RoleGlobalOrdersPage';

export default function DispatchOrdersPage() {
  return (
    <RoleGuard allowedRoles={['DISPATCH', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/dispatch">
      <RoleGlobalOrdersPage primaryRole="DISPATCH" />
    </RoleGuard>
  );
}
