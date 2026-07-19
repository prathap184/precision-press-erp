export const dynamic = 'force-dynamic';
import { LedgerDetailView } from '@/components/ledger/LedgerDetailView';

export default function AccountantLedgerDetailPage({ params }: { params: { customerId: string } }) {
  return (
    <LedgerDetailView
      targetUserId={params.customerId}
      backHref="/accountant/ledger"
      backLabel="Customer List"
      showBreadcrumb
    />
  );
}
