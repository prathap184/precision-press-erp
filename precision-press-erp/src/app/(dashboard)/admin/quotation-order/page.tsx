import { ProxyOrderBuilder } from '@/components/acdema/ProxyOrderBuilder';

export default function QuotationOrderPage() {
  return (
    <div className="flex-1 rounded-3xl bg-[#f8fafc] p-4 md:p-6 lg:p-8">
      <ProxyOrderBuilder mode="quotation" />
    </div>
  );
}
