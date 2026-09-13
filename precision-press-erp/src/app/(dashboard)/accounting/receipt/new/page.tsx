"use client";

import { ReceiptForm } from "@/components/dashboard/receipt-form";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function NewReceiptVoucherPage() {
  useDocumentTitle("Accounting · New Receipt Voucher (F6)");

  return (
    <div className="min-h-full w-full p-2 sm:p-4">
      <ReceiptForm />
    </div>
  );
}

