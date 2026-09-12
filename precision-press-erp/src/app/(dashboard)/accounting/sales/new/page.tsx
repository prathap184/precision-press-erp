"use client";

import { InvoiceFormView } from "@/components/dashboard/InvoiceFormView";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function NewInvoicePage() {
  useDocumentTitle("Accounting · New Sales Invoice");

  return <InvoiceFormView />;
}
