'use client';
import { RoleGuard } from '@/lib/role-guard';
import { RoleGlobalOrdersPage } from '@/components/orders/RoleGlobalOrdersPage';

export default function SupportOrdersPage() {
  return (
    <RoleGuard allowedRoles={['SUPPORT', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/support">
      <RoleGlobalOrdersPage primaryRole="SUPPORT" />
    </RoleGuard>
  );
}
