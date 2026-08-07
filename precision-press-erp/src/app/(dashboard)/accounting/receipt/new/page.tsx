"use client";

import { ReceiptForm } from "@/components/dashboard/receipt-form";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function NewReceiptVoucherPage() {
  useDocumentTitle("Accounting · New Receipt Voucher (F6)");

  return (
    <div className="h-full w-full py-6 px-6">
      <ReceiptForm />
    </div>
  );
}
