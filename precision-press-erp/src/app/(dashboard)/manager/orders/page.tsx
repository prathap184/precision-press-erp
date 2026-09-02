'use client';
import { RoleGuard } from '@/lib/role-guard';
import { RoleGlobalOrdersPage } from '@/components/orders/RoleGlobalOrdersPage';

export default function ManagerOrdersPage() {
  return (
    <RoleGuard allowedRoles={['MANAGER', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/manager">
      <RoleGlobalOrdersPage primaryRole="MANAGER" />
    </RoleGuard>
  );
}
