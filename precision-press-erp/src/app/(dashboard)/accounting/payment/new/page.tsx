"use client";

import { PaymentForm } from "@/components/dashboard/payment-form";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function NewPaymentVoucherPage() {
  useDocumentTitle("Accounting · New Payment Voucher (F5)");

  return (
    <div className="h-full w-full py-6 px-6">
      <PaymentForm />
    </div>
  );
}
