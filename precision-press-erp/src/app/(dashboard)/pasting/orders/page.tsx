'use client';
import { RoleGuard } from '@/lib/role-guard';
import { RoleGlobalOrdersPage } from '@/components/orders/RoleGlobalOrdersPage';

export default function PastingOrdersPage() {
  return (
    <RoleGuard allowedRoles={['PASTING', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/pasting">
      <RoleGlobalOrdersPage primaryRole="PASTING" />
    </RoleGuard>
  );
}
