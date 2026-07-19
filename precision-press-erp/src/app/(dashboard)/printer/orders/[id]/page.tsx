'use client';
export const dynamic = 'force-dynamic';

import React from 'react';
import { useParams } from 'next/navigation';

import { RoleGuard } from '@/lib/role-guard';
import { PrinterOrderWorkspace } from '@/components/orders/PrinterOrderWorkspace';

export default function PrinterOrderDetailPage() {
  const params = useParams();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  return (
    <RoleGuard allowedRoles={['PRINTER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <PrinterOrderWorkspace
        orderId={orderId}
        backHref="/printer/queue"
        backLabel="Back to Queue"
        secondaryHref="/printer"
        secondaryLabel="Open Dashboard"
        headerLabel="Printer Order Detail"
      />
    </RoleGuard>
  );
}
