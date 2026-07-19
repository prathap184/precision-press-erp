'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { DesignerOrderWorkspace } from '@/components/orders/DesignerOrderWorkspace';

export default function DesignerOrderDetailPage() {
  const params = useParams();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  return (
    <RoleGuard allowedRoles={['DESIGNER', 'ACDEMA', 'MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <DesignerOrderWorkspace orderId={orderId} />
      </div>
    </RoleGuard>
  );
}
