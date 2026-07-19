'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { FinishingOrderWorkspace } from '@/components/orders/FinishingOrderWorkspace';

export default function FinishingOrderDetailPage() {
  const params = useParams();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  return (
    <RoleGuard allowedRoles={['FINISHING', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <FinishingOrderWorkspace
        orderId={orderId}
        backHref="/finishing"
        backLabel="Back to Dashboard"
        secondaryHref="/finishing"
        secondaryLabel="Open Dashboard"
      />
    </RoleGuard>
  );
}