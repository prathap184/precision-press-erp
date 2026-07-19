'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { useParams } from 'next/navigation';

import { RoleGuard } from '@/lib/role-guard';
import { PrinterOrderWorkspace } from '@/components/orders/PrinterOrderWorkspace';

export default function AdminOrderDetailsPage() {
  const params = useParams();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'SUPPORT', 'PRINTER', 'DESIGNER']}>
      <PrinterOrderWorkspace
        orderId={orderId}
        backHref="/admin/orders"
        backLabel="Back to Global Orders"
        secondaryHref="/printer/queue"
        secondaryLabel="Open Printer Queue"
        headerLabel="Order Detail"
      />
    </RoleGuard>
  );
}
