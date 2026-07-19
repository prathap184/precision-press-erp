'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { PrinterOrderWorkspace } from '@/components/orders/PrinterOrderWorkspace';

export default function AcdemaOrderDetailsPage() {
  const params = useParams();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  return (
    <RoleGuard allowedRoles={['ACDEMA', 'ADMIN', 'SUPER_ADMIN']}>
      <PrinterOrderWorkspace
        orderId={orderId}
        backHref="/acdema/orders"
        backLabel="Back to Global Orders"
        secondaryHref="/acdema?view=control"
        secondaryLabel="Open ACDEMA Control"
        headerLabel="Order Detail"
      />
    </RoleGuard>
  );
}
