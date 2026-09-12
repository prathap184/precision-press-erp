import { ProxyOrderBuilder } from '@/components/acdema/ProxyOrderBuilder';

export default function ProxyOrderPage({ searchParams }: { searchParams: { quotationId?: string } }) {
  return (
    <div className="w-full animate-in fade-in duration-500">
      <ProxyOrderBuilder quotationId={searchParams.quotationId} />
    </div>
  );
}
