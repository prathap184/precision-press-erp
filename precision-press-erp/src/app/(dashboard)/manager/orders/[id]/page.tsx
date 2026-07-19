'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { RoleGuard } from '@/lib/role-guard';
import { ManagerOrderWorkspace } from '@/components/orders/ManagerOrderWorkspace';

export default function ManagerOrderDetailPage() {
  const params = useParams();
  const orderId = String(Array.isArray(params.id) ? params.id[0] : params.id || '');

  return (
    <RoleGuard allowedRoles={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <ManagerOrderWorkspace orderId={orderId} />
      </div>
    </RoleGuard>
  );
}
