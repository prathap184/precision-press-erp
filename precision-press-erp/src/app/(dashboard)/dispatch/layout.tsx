'use client';

import React from 'react';
import { RoleGuard } from '@/lib/role-guard';

export default function DispatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['DISPATCH', 'ADMIN', 'SUPER_ADMIN']} redirectTo="/staff">
      <div className="w-full min-h-full">
        {children}
      </div>
    </RoleGuard>
  );
}
