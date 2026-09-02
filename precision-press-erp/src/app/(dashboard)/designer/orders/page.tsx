'use client';
import { RoleGuard } from '@/lib/role-guard';
import { RoleGlobalOrdersPage } from '@/components/orders/RoleGlobalOrdersPage';

export default function DesignerOrdersPage() {
  return (
    <RoleGuard allowedRoles={['DESIGNER', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/designer">
      <RoleGlobalOrdersPage primaryRole="DESIGNER" />
    </RoleGuard>
  );
}
