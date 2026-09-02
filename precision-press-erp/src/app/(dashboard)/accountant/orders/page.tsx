'use client';
import { RoleGuard } from '@/lib/role-guard';
import { RoleGlobalOrdersPage } from '@/components/orders/RoleGlobalOrdersPage';

export default function AccountantOrdersPage() {
  return (
    <RoleGuard allowedRoles={['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/accountant">
      <RoleGlobalOrdersPage primaryRole="ACCOUNTANT" />
    </RoleGuard>
  );
}
