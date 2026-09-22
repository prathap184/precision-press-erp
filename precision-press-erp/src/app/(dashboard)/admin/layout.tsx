'use client';
import { RoleGuard } from '@/lib/role-guard';
import { useAuth } from '@/lib/auth-context';
import { getFallbackOrdersUrl } from '@/lib/useStageWorkspaceGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles, role } = useAuth();
  const fallbackUrl = getFallbackOrdersUrl(roles, role);

  return (
    <RoleGuard 
      allowedRoles={['ADMIN', 'SUPER_ADMIN']}
      redirectTo={fallbackUrl}
    >
      <div className='w-full min-h-full'>
        {children}
      </div>
    </RoleGuard>
  );
}
