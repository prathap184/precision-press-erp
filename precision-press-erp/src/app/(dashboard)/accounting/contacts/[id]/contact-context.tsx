"use client";

import { createContext, useContext } from "react";
import { FileText, ScrollText, CreditCard, Banknote, Receipt } from "lucide-react";
import type { useConfirm } from "@/lib/hooks/use-confirm";

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export interface ContactPerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface ContactDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  type: "customer" | "supplier" | "both";
  paymentTermsDays: number;
  creditLimit: number | null;
  isTaxExempt: boolean;
  is1099Vendor: boolean;
  currencyCode: string | null;
  defaultRevenueAccountId: string | null;
  defaultExpenseAccountId: string | null;
  defaultTaxRateId: string | null;
  defaultRevenueAccount: { id: string; code: string; name: string } | null;
  defaultExpenseAccount: { id: string; code: string; name: string } | null;
  defaultTaxRate: { id: string; name: string; rate: number } | null;
  people: ContactPerson[];
  notes: string | null;
  createdAt: string;
}

export interface ContactFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  visibility: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
}

export interface ActivityItem {
  id: string;
  type: "invoice" | "quote" | "credit_note" | "payment" | "bill";
  number: string;
  status: string;
  amount: number;
  currencyCode: string;
  date: string;
  createdAt: string;
}

export const activityTypeConfig: Record<ActivityItem["type"], {
  label: string;
  icon: typeof FileText;
  color: string;
  bg: string;
  href: (id: string) => string;
}> = {
  invoice: {
    label: "Invoice",
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    href: (id) => `/sales/${id}`,
  },
  quote: {
    label: "Quote",
    icon: ScrollText,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    href: (id) => `/sales/quotes/${id}`,
  },
  credit_note: {
    label: "Credit Note",
    icon: CreditCard,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    href: (id) => `/sales/credit-notes/${id}`,
  },
  payment: {
    label: "Payment",
    icon: Banknote,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    href: () => `/sales/payments`,
  },
  bill: {
    label: "Bill",
    icon: Receipt,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    href: (id) => `/purchases/bills/${id}`,
  },
};

// ---------------------------------------------------------------------------
// Context value shape — mirrors what ContactDetailLayout.Provider actually passes
// ---------------------------------------------------------------------------

export interface ContactContextValue {
  contact: ContactDetail;
  setContact: React.Dispatch<React.SetStateAction<ContactDetail | null>>;
  fetchContact: () => Promise<void>;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  confirmDialog: ReturnType<typeof useConfirm>["dialog"];
  // Shared form state
  formType: string;
  setFormType: (v: string) => void;
  formRevenueAccountId: string;
  setFormRevenueAccountId: (v: string) => void;
  formExpenseAccountId: string;
  setFormExpenseAccountId: (v: string) => void;
  formTaxRateId: string;
  setFormTaxRateId: (v: string) => void;
  formTaxExempt: boolean;
  setFormTaxExempt: (v: boolean) => void;
  form1099Vendor: boolean;
  setForm1099Vendor: (v: boolean) => void;
  formCreditLimit: string;
  setFormCreditLimit: (v: string) => void;
  formCurrencyCode: string;
  setFormCurrencyCode: (v: string) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}

export const ContactContext = createContext<ContactContextValue | null>(null);

export function useContactContext(): ContactContextValue {
  const ctx = useContext(ContactContext);
  if (!ctx) throw new Error("useContactContext must be used within ContactDetailLayout");
  return ctx;
}
