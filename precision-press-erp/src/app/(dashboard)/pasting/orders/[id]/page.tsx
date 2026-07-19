'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { PastingOrderWorkspace } from '@/components/orders/PastingOrderWorkspace';

export default function PastingOrderDetailPage() {
  const params = useParams();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  return (
    <RoleGuard allowedRoles={['PASTING', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <PastingOrderWorkspace
        orderId={orderId}
        backHref="/pasting"
        backLabel="Back to Dashboard"
        secondaryHref="/pasting"
        secondaryLabel="Open Dashboard"
      />
    </RoleGuard>
  );
}