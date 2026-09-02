'use client';
import { RoleGuard } from '@/lib/role-guard';
import { RoleGlobalOrdersPage } from '@/components/orders/RoleGlobalOrdersPage';

export default function PrinterOrdersPage() {
  return (
    <RoleGuard allowedRoles={['PRINTER', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/printer">
      <RoleGlobalOrdersPage primaryRole="PRINTER" />
    </RoleGuard>
  );
}
