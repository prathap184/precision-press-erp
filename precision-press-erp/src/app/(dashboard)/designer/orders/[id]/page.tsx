'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { DesignerOrderWorkspace } from '@/components/orders/DesignerOrderWorkspace';

export default function DesignerOrderDetailPage() {
  const params = useParams();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  return (
    <RoleGuard allowedRoles={['DESIGNER', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/staff">
      <DesignerOrderWorkspace orderId={orderId} />
    </RoleGuard>
  );
}
