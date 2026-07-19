export const dynamic = 'force-dynamic';
import { RoleGuard } from "@/lib/role-guard";
import ProductManagement from "@/components/admin/ProductManagement";
import { StaffRoleSwitcher } from "@/components/dashboard/StaffRoleSwitcher";

export default function AdminProductsPage() {
  return (
    <RoleGuard allowedRoles={['ADMIN', 'SUPER_ADMIN']}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[28px] font-bold font-bold text-slate-900">Product Management</h1>
          <StaffRoleSwitcher />
        </div>
        <ProductManagement />
      </div>
    </RoleGuard>
  );
}
