'use client';
import { RoleGuard } from '@/lib/role-guard';
import { RoleGlobalOrdersPage } from '@/components/orders/RoleGlobalOrdersPage';

export default function FinishingOrdersPage() {
  return (
    <RoleGuard allowedRoles={['FINISHING', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/finishing">
      <RoleGlobalOrdersPage primaryRole="FINISHING" />
    </RoleGuard>
  );
}
