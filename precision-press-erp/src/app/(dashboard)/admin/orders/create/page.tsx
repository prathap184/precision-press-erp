export const dynamic = 'force-dynamic';
import { OrderBuilder } from "@/components/dashboard/OrderBuilder";

export default function CreateOrderPage() {
  return (
    <div className="animate-in fade-in duration-700 space-y-4">
      <header className="mb-4">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
          <div className="w-4 h-px bg-slate-400" />
          Production Pipeline
        </div>
        <h1 className="text-[28px] font-bold font-semibold text-slate-800 tracking-tight">Generate New Order</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-xl">
          Initialize a new print job. Dimensions calculated in real-time.
        </p>
      </header>
      
      <OrderBuilder />
    </div>
  );
}
