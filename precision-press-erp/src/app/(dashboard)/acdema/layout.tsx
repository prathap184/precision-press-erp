'use client';

import React from 'react';
import { RoleGuard } from '@/lib/role-guard';

export default function AcdemaLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['ACDEMA', 'SUPER_ADMIN']} redirectTo="/staff">
      <div className="w-full min-h-full">
        {children}
      </div>
    </RoleGuard>
  );
}
