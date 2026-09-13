"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  ArrowDownLeft,
  ArrowLeft,
  Info,
  CheckCircle2,
  Building2,
  Calendar,
  Landmark,
  FileText,
  Save,
  Check,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { formatMoney } from "@/lib/money";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subType?: string | null;
}

interface BankAccountOption {
  id: string;
  accountName: string;
  chartAccountId?: string;
  currencyCode: string;
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  issueDate?: string;
  amountDue: number;
  total: number;
  currencyCode: string;
}

function isoToDisplayDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

function parseTallyDate(input: string, fallbackIso: string = new Date().toISOString().split("T")[0]): string {
  if (!input || !input.trim()) return fallbackIso;
  const raw = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const parts = raw.split(/[\s\-\/\.]+/).filter(Boolean);

  if (parts.length === 1) {
    const digits = parts[0];
    if (digits.length === 1 || digits.length === 2) {
      const day = parseInt(digits, 10);
      if (day >= 1 && day <= 31) {
        return `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    } else if (digits.length === 4) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    } else if (digits.length === 6) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      let year = parseInt(digits.slice(4, 6), 10);
      year = year < 50 ? 2000 + year : 1900 + year;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    } else if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      const year = parseInt(digits.slice(4, 8), 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  } else if (parts.length === 2) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  } else if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return fallbackIso;
}

export function ReceiptForm() {
  const router = useRouter();

  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dateDisplayInput, setDateDisplayInput] = useState(() => isoToDisplayDate(new Date().toISOString().split("T")[0]));

  useEffect(() => {
    if (date) {
      setDateDisplayInput(isoToDisplayDate(date));
    }
  }, [date]);

  const [contactId, setContactId] = useState("");
  const [initialContactName, setInitialContactName] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditAccountId, setCreditAccountId] = useState("");
  const [amount, setAmount] = useState("0.00");
  const [narration, setNarration] = useState("");

  // Bill-wise Adjustment State (Tally Methods of Adjustment)
  const [adjustmentType, setAdjustmentType] = useState<"AGAINST_REF" | "NEW_REF" | "ON_ACCOUNT">("AGAINST_REF");
  const [referenceName, setReferenceName] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [saving, setSaving] = useState(false);

  // Pre-fill from Global Orders or sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("pending_receipt_draft");
      if (stored) {
        sessionStorage.removeItem("pending_receipt_draft");
        const data = JSON.parse(stored);
        if (data.contactId) setContactId(data.contactId);
        if (data.contactName) setInitialContactName(data.contactName);
        if (data.amount) setAmount(String(data.amount));
        if (data.notes || data.narration) setNarration(data.notes || data.narration);
        if (data.reference) setReferenceName(data.reference);
        if (data.settlementMode === "on_account") setAdjustmentType("ON_ACCOUNT");
      }
    } catch (e) {
      console.error("Failed to load receipt draft", e);
    }
  }, []);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/bank-accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.bankAccounts && Array.isArray(data.bankAccounts)) {
          setBankAccounts(data.bankAccounts);
          if (data.bankAccounts.length > 0) {
            setBankAccountId(data.bankAccounts[0].id);
          }
        }
      })
      .catch((err) => console.error("Failed to load bank accounts", err));

    fetch("/api/v1/accounts?limit=500", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((acctData) => {
        const accts: Account[] = acctData.accounts || acctData.data || [];
        setAccounts(accts);
        const ar = accts.find(
          (a: Account) =>
            a.code === "1200" ||
            a.subType === "receivable" ||
            a.name.toLowerCase().includes("receivable")
        );
        if (ar) setCreditAccountId(ar.id);
      })
      .catch((err) => console.error("Failed to load accounts", err));
  }, []);

  // Auto-generate Advance Reference when switching to NEW_REF if empty
  useEffect(() => {
    if (adjustmentType === "NEW_REF" && (!referenceName || referenceName.startsWith("INV-"))) {
      const todayStr = date.replace(/-/g, "");
      const randSuffix = Math.floor(Math.random() * 900) + 100;
      setReferenceName(`ADV-${todayStr}-${randSuffix}`);
    }
  }, [adjustmentType, date, referenceName]);

  // Fetch unpaid invoices when customer is selected
  useEffect(() => {
    if (!contactId) {
      setInvoices([]);
      setSelectedInvoiceId("");
      return;
    }

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setLoadingInvoices(true);
    fetch(`/api/v1/invoices?contactId=${contactId}&limit=100`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const invList: any[] = data.invoices || data.data || [];
        const unpaid = invList.filter((inv) => (inv.amountDue ?? inv.total ?? 0) > 0);
        setInvoices(unpaid);

        if (unpaid.length > 0) {
          if (adjustmentType === "AGAINST_REF" && !selectedInvoiceId) {
            setSelectedInvoiceId(unpaid[0].id);
            setReferenceName(unpaid[0].invoiceNumber);
            setAmount(((unpaid[0].amountDue ?? unpaid[0].total) / 100).toFixed(2));
          }
        } else {
          // If no open invoices, default to NEW_REF (Advance) or ON_ACCOUNT
          if (adjustmentType === "AGAINST_REF") {
            setAdjustmentType("NEW_REF");
          }
        }
      })
      .catch((err) => console.error("Failed to load invoices", err))
      .finally(() => setLoadingInvoices(false));
  }, [contactId, adjustmentType]);

  // Handle invoice selection click
  function handleInvoiceSelect(inv: InvoiceOption) {
    setSelectedInvoiceId(inv.id);
    setReferenceName(inv.invoiceNumber);
    const due = (inv.amountDue ?? inv.total) / 100;
    setAmount(due.toFixed(2));
  }

  // Keyboard shortcut: F2 & Ctrl + Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        const dateInput = document.getElementById("receipt-form-date-input") as HTMLInputElement;
        if (dateInput) {
          dateInput.focus();
          try {
            dateInput.select();
          } catch {}
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    contactId,
    amount,
    date,
    dateDisplayInput,
    bankAccountId,
    creditAccountId,
    adjustmentType,
    referenceName,
    selectedInvoiceId,
    narration,
  ]);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid receipt amount greater than 0");
      const amtEl = document.getElementById("receipt-form-amount-input");
      if (amtEl) amtEl.focus();
      return;
    }

    if (!bankAccountId) {
      toast.error("Please select a bank or cash account");
      return;
    }

    if (!contactId) {
      toast.error("Please select a customer ledger account");
      const custEl = document.getElementById("receipt-form-customer-search-input");
      if (custEl) custEl.focus();
      return;
    }

    if (adjustmentType === "AGAINST_REF" && !selectedInvoiceId && invoices.length > 0) {
      toast.error("Please select an unpaid invoice to settle");
      return;
    }

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) {
      toast.error("Organization not found");
      return;
    }

    setSaving(true);
    const cents = Math.round(numAmount * 100);

    try {
      if (adjustmentType === "NEW_REF") {
        // Customer Advance: creates trackable customerCredit and journal entry
        const res = await fetch("/api/v1/customer-credits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({
            contactId,
            date,
            amount: cents,
            sourceType: "prepayment",
            bankAccountId,
            adjustmentType: "NEW_REF",
            referenceName: referenceName.trim() || `ADV-${date.replace(/-/g, "")}`,
            notes: narration || `Customer Advance ${referenceName || ""}`.trim(),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to record Advance Receipt");
        }

        toast.success(`Advance Receipt (${referenceName || "ADV"}) recorded successfully! ✓`);
      } else if (adjustmentType === "AGAINST_REF" && selectedInvoiceId) {
        // Settle against specific invoice via payments allocation API
        const res = await fetch("/api/v1/payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({
            contactId,
            type: "received",
            date,
            amount: cents,
            method: "bank_transfer",
            reference: referenceName || `REC-${date.replace(/-/g, "")}`,
            notes: narration || `Receipt against invoice ${referenceName}`,
            bankAccountId,
            allocations: [
              {
                documentType: "invoice",
                documentId: selectedInvoiceId,
                amount: cents,
              },
            ],
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to post invoice payment");
        }

        toast.success(`Payment of ₹${numAmount.toFixed(2)} applied to ${referenceName}! ✓`);
      } else {
        // On Account: Direct ledger credit entry
        const selectedBank = bankAccounts.find((b) => b.id === bankAccountId);
        const debitAccountId = selectedBank?.chartAccountId || selectedBank?.id;

        let resolvedCreditAccountId = creditAccountId;
        if (!resolvedCreditAccountId) {
          const ar = accounts.find(
            (a) =>
              a.code === "1200" ||
              a.subType === "receivable" ||
              a.name.toLowerCase().includes("receivable")
          );
          if (ar) resolvedCreditAccountId = ar.id;
        }

        const res = await fetch("/api/v1/entries", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({
            date,
            description: narration || `Receipt On Account - Customer Ledger`,
            voucherType: "RECEIPT",
            subType: "on_account",
            status: "posted",
            sourceModule: "RECEIPT",
            lines: [
              {
                accountId: debitAccountId,
                debitAmount: cents,
                creditAmount: 0,
                currencyCode: "INR",
              },
              {
                accountId: resolvedCreditAccountId,
                debitAmount: 0,
                creditAmount: cents,
                currencyCode: "INR",
                contactId: contactId || null,
                adjustmentType: "ON_ACCOUNT",
              },
            ],
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to post On Account Receipt");
        }

        toast.success("On Account Receipt Voucher posted successfully! ✓");
      }

      router.push("/accounting/receipt");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Receipt Voucher");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#eaf2fc] text-slate-800 pb-28 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top sticky navigation bar */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/accounting/receipt")}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            <ArrowLeft className="size-4 mr-1.5" />
            Back to Receipts
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20">
              <ArrowDownLeft className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                Receipt Voucher Terminal (F6)
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Record payments, advances, & ledger receipts
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/accounting/receipt")}
            className="rounded-xl border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={saving}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25 px-5 font-bold cursor-pointer"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Posting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="size-4" />
                Post Receipt Voucher (Ctrl+Enter)
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Main Terminal Body */}
      <main className="max-w-[1300px] mx-auto p-6 sm:p-8 space-y-6">
        {/* Top Info Grid */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Voucher Date Card with F2 text typing */}
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-emerald-600" />
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Voucher Date
                </h2>
              </div>
              <kbd className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                F2
              </kbd>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-slate-500">
                Receipt Date (DD-MM-YYYY) *
              </Label>
              <input
                id="receipt-form-date-input"
                type="text"
                inputMode="numeric"
                value={dateDisplayInput}
                onChange={(e) => setDateDisplayInput(e.target.value)}
                onBlur={() => {
                  const parsed = parseTallyDate(dateDisplayInput, date);
                  setDate(parsed);
                  setDateDisplayInput(isoToDisplayDate(parsed));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const parsed = parseTallyDate(dateDisplayInput, date);
                    setDate(parsed);
                    setDateDisplayInput(isoToDisplayDate(parsed));
                    const nextEl = document.getElementById("receipt-form-customer-search-input");
                    if (nextEl) nextEl.focus();
                  }
                }}
                placeholder="DD-MM-YYYY"
                className="h-10 w-full bg-slate-50 hover:bg-slate-100 focus:bg-white text-slate-800 font-mono font-bold text-xs px-3 rounded-xl border-2 border-slate-200 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all cursor-text"
                title="Voucher Date (Press F2 to focus)"
              />
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              Press <span className="font-bold text-slate-600">F2</span> anywhere to quickly edit the date.
            </p>
          </div>

          {/* Deposit Account (Debit) Card */}
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center gap-2">
              <Landmark className="size-4 text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                Received Into Account *
              </h2>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-slate-500">
                Bank / Cash Account (Debit Ledger)
              </Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200 h-10 text-xs font-bold text-slate-800 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/20">
                  <SelectValue placeholder="Select bank/cash..." />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 shadow-2xl z-[9999]">
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="font-semibold text-xs">
                      {b.accountName} ({b.currencyCode || "INR"})
                    </SelectItem>
                  ))}
                  {bankAccounts.length === 0 && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No bank or cash accounts found
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Funds received will instantly update this ledger account and cash flow statements.
            </p>
          </div>

          {/* Customer / Credit Account Card */}
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                Customer Ledger *
              </h2>
            </div>

            <ContactPicker
              id="receipt-form-customer-search-input"
              value={contactId}
              initialContactName={initialContactName}
              onChange={(id) => {
                setContactId(id);
                setSelectedInvoiceId("");
              }}
              type="customer"
              onSelectAdvance={() => {
                const amtInput = document.getElementById("receipt-form-amount-input") as HTMLElement;
                if (amtInput) {
                  amtInput.focus();
                  try {
                    (amtInput as HTMLInputElement).select();
                  } catch {}
                }
              }}
            />

            <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>Customer Ledger (1200 - AR)</span>
              </div>
              <span className="text-[10px] font-mono font-bold bg-white text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                Auto
              </span>
            </div>
          </div>
        </div>

        {/* ALWAYS-VISIBLE Bill-wise Adjustment Section (Tally Methods of Adjustment) */}
        <div className="rounded-[2rem] bg-white/85 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CreditCard className="size-5 text-emerald-600" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">
                  Method of Adjustment (Bill-wise Settlement)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Choose how this receipt is credited against the customer account
                </p>
              </div>
            </div>
            {contactId && invoices.length > 0 && (
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-3 py-1 rounded-full shadow-2xs">
                {invoices.length} Unpaid Invoice(s) Found
              </span>
            )}
          </div>

          {/* 3 Prominent Adjustment Mode Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* 1. AGST REF */}
            <div
              onClick={() => setAdjustmentType("AGAINST_REF")}
              className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                adjustmentType === "AGAINST_REF"
                  ? "border-emerald-600 bg-emerald-50/90 font-bold shadow-md ring-4 ring-emerald-500/20"
                  : "bg-slate-50/80 hover:bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                    <span>Agst Ref</span>
                    <span className="text-[11px] font-semibold text-emerald-700 font-sans">
                      (Against Bill)
                    </span>
                  </div>
                  {adjustmentType === "AGAINST_REF" && (
                    <span className="h-5 w-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Settle a specific pending invoice and reduce its outstanding balance.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                <span>Direct Invoice Settlement</span>
                <span className="font-mono font-bold text-emerald-700">Tally F6 Agst</span>
              </div>
            </div>

            {/* 2. NEW REF (Advance) */}
            <div
              onClick={() => setAdjustmentType("NEW_REF")}
              className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                adjustmentType === "NEW_REF"
                  ? "border-emerald-600 bg-emerald-50/90 font-bold shadow-md ring-4 ring-emerald-500/20"
                  : "bg-slate-50/80 hover:bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                    <span>New Ref</span>
                    <span className="text-[11px] font-semibold text-amber-700 font-sans">
                      (Advance Receipt)
                    </span>
                  </div>
                  {adjustmentType === "NEW_REF" && (
                    <span className="h-5 w-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Create an advance credit reference to adjust against future invoices.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                <span>Customer Prepayment Credit</span>
                <span className="font-mono font-bold text-amber-700">Tally F6 Advance</span>
              </div>
            </div>

            {/* 3. ON ACCOUNT */}
            <div
              onClick={() => setAdjustmentType("ON_ACCOUNT")}
              className={`cursor-pointer p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                adjustmentType === "ON_ACCOUNT"
                  ? "border-emerald-600 bg-emerald-50/90 font-bold shadow-md ring-4 ring-emerald-500/20"
                  : "bg-slate-50/80 hover:bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                    <span>On Account</span>
                    <span className="text-[11px] font-semibold text-blue-700 font-sans">
                      (Lump Sum)
                    </span>
                  </div>
                  {adjustmentType === "ON_ACCOUNT" && (
                    <span className="h-5 w-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Post direct lump-sum credit to the customer ledger without bill reference.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                <span>General Ledger Credit</span>
                <span className="font-mono font-bold text-blue-700">Tally F6 On Acc</span>
              </div>
            </div>
          </div>

          {/* Conditional Sub-panel based on active Method */}
          <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-200 space-y-3">
            {adjustmentType === "AGAINST_REF" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Select Open Invoice to Settle:
                  </Label>
                  {invoices.length > 0 && (
                    <span className="text-[11px] font-medium text-slate-500">
                      Click any invoice to auto-fill exact amount
                    </span>
                  )}
                </div>

                {loadingInvoices ? (
                  <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin text-emerald-600" />
                    Fetching unpaid customer invoices...
                  </div>
                ) : !contactId ? (
                  <div className="p-5 text-center text-xs text-slate-500 bg-white rounded-xl border border-dashed border-slate-300 flex items-center justify-center gap-2">
                    <AlertCircle className="size-4 text-slate-400" />
                    <span>Please select a Customer Ledger above to view their pending invoices.</span>
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-600 bg-amber-50/60 rounded-xl border border-amber-200">
                    <p className="font-bold text-amber-900">
                      No unpaid invoices found for this customer!
                    </p>
                    <p className="text-[11px] text-amber-700 mt-1">
                      You can switch to <strong className="cursor-pointer underline" onClick={() => setAdjustmentType("NEW_REF")}>New Ref (Advance)</strong> to record an advance payment, or <strong className="cursor-pointer underline" onClick={() => setAdjustmentType("ON_ACCOUNT")}>On Account</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-2 max-h-60 overflow-y-auto pr-1">
                    {invoices.map((inv) => {
                      const isSelected = selectedInvoiceId === inv.id;
                      const due = (inv.amountDue ?? inv.total) / 100;
                      const total = inv.total / 100;
                      return (
                        <div
                          key={inv.id}
                          onClick={() => handleInvoiceSelect(inv)}
                          className={`cursor-pointer p-3 rounded-xl border-2 transition-all flex items-center justify-between ${
                            isSelected
                              ? "bg-emerald-50 border-emerald-600 shadow-xs"
                              : "bg-white hover:bg-slate-100/80 border-slate-200"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                isSelected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"
                              }`}
                            >
                              {isSelected && <Check size={10} className="stroke-[3]" />}
                            </div>
                            <div>
                              <div className="font-mono font-bold text-xs text-slate-900">
                                {inv.invoiceNumber}
                              </div>
                              {inv.issueDate && (
                                <div className="text-[10px] text-slate-500">
                                  Date: {isoToDisplayDate(inv.issueDate)}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-black text-emerald-700 font-mono">
                              Due: ₹{due.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Total: ₹{total.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {adjustmentType === "NEW_REF" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Advance Reference Number *
                  </Label>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Auto-generated (editable)
                  </span>
                </div>
                <div className="max-w-md">
                  <Input
                    placeholder="e.g. ADV-20260913-001"
                    className="bg-white rounded-xl h-10 border-2 border-slate-200 font-mono font-bold text-xs focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/20"
                    value={referenceName}
                    onChange={(e) => setReferenceName(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium leading-relaxed">
                  💡 This payment will be stored as an unapplied advance credit under this customer. When creating future sales invoices or proxy orders, you will be able to select and deduct this advance using <strong>Agst Ref</strong>.
                </p>
              </div>
            )}

            {adjustmentType === "ON_ACCOUNT" && (
              <div className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded-xl p-3 font-medium leading-relaxed">
                ℹ️ <strong>On Account Receipt:</strong> This amount is credited directly to the customer ledger balance (Accounts Receivable). It is not tied to a single bill reference and reduces the total customer outstanding balance immediately.
              </div>
            )}
          </div>
        </div>

        {/* Amount & Narration Card */}
        <div className="grid gap-6 sm:grid-cols-12">
          {/* Amount Card (5 cols) */}
          <div className="sm:col-span-5 rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-500">
                Amount Received (₹) *
              </Label>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                INR
              </span>
            </div>
            <Input
              id="receipt-form-amount-input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="text-2xl font-mono font-bold text-emerald-600 h-14 bg-slate-50 border-2 border-slate-200 focus:border-emerald-600 focus:bg-white rounded-2xl outline-none"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const narrationEl = document.getElementById("receipt-form-narration-input");
                  if (narrationEl) narrationEl.focus();
                }
              }}
            />
            <p className="text-[11px] text-slate-400">
              Total received via Cash / UPI / NEFT / Cheque.
            </p>
          </div>

          {/* Narration Card (7 cols) */}
          <div className="sm:col-span-7 rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-3">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-500">
              Narration / Voucher Notes
            </Label>
            <Textarea
              id="receipt-form-narration-input"
              rows={3}
              placeholder="e.g. Received via GPay UPI ref #829184 for order delivery, thank you..."
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="rounded-2xl border-2 border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-600 text-xs font-medium"
            />
          </div>
        </div>
      </main>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3.5 px-8 shadow-2xl flex items-center justify-between">
        <div className="text-xs text-slate-500 flex items-center gap-4">
          <span>
            Adjustment:{" "}
            <strong className="text-slate-800 uppercase font-black">
              {adjustmentType === "AGAINST_REF"
                ? `Agst Ref (${referenceName || "Invoice"})`
                : adjustmentType === "NEW_REF"
                ? `New Ref (${referenceName || "Advance"})`
                : "On Account"}
            </strong>
          </span>
          <span className="h-3 w-px bg-slate-300" />
          <span>
            Total:{" "}
            <strong className="text-emerald-600 font-mono text-sm font-black">
              ₹{parseFloat(amount || "0").toFixed(2)}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/accounting/receipt")}
            className="rounded-xl border-slate-300 hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={saving}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25 px-6 font-bold cursor-pointer"
          >
            {saving ? "Posting Voucher..." : "Post Receipt Voucher (Ctrl+Enter)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
