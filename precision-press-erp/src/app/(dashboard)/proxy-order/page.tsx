import { ProxyOrderBuilder } from '@/components/acdema/ProxyOrderBuilder';

export default function ProxyOrderPage({ searchParams }: { searchParams: { quotationId?: string } }) {
  return (
    <div className="p-4 md:p-6 lg:p-8 animate-in fade-in duration-700 w-full">
      <ProxyOrderBuilder quotationId={searchParams.quotationId} />
    </div>
  );
}
