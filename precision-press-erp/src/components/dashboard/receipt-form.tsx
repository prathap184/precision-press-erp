"use client";

import { useEffect, useState } from "react";
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
  Plus,
  CheckCircle2,
  Building2,
  Calendar,
  Landmark,
  FileText,
  Save,
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
  amountDue: number;
  total: number;
  currencyCode: string;
}

const RECEIPT_SUBTYPES = [
  { value: "invoice_payment", label: "Invoice Payment" },
  { value: "advance", label: "Customer Advance" },
  { value: "on_account", label: "On Account" },
  { value: "security_deposit", label: "Security Deposit" },
  { value: "loan_received", label: "Loan Received" },
];

export function ReceiptForm() {
  const router = useRouter();

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [subType, setSubType] = useState("invoice_payment");
  const [contactId, setContactId] = useState("");
  const [initialContactName, setInitialContactName] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditAccountId, setCreditAccountId] = useState("");
  const [amount, setAmount] = useState("0.00");
  const [narration, setNarration] = useState("");

  // Bill-wise Adjustment State
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
        const ar = accts.find((a: Account) => a.code === "1200" || a.subType === "receivable" || a.name.toLowerCase().includes("receivable"));
        if (ar) setCreditAccountId(ar.id);
      })
      .catch((err) => console.error("Failed to load accounts", err));
  }, []);

  // Auto-focus customer input on mount
  useEffect(() => {
    setTimeout(() => {
      const el = document.getElementById("receipt-form-customer-search-input") as HTMLInputElement;
      if (el) {
        el.focus();
        try { el.select(); } catch {}
      }
    }, 150);
  }, []);

  // Update default Credit Account when Subtype changes
  useEffect(() => {
    if (accounts.length === 0) return;

    if (subType === "invoice_payment" || subType === "advance" || subType === "on_account") {
      const ar = accounts.find((a) => a.code === "1200" || a.subType === "receivable" || a.name.toLowerCase().includes("receivable"));
      if (ar) setCreditAccountId(ar.id);
    } else if (subType === "security_deposit") {
      const dep = accounts.find((a) => a.name.toLowerCase().includes("deposit") || a.code === "2100");
      if (dep) setCreditAccountId(dep.id);
    } else if (subType === "loan_received") {
      const loan = accounts.find((a) => a.name.toLowerCase().includes("loan") || a.code === "2200");
      if (loan) setCreditAccountId(loan.id);
    }
  }, [subType, accounts]);

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

        if (unpaid.length > 0 && subType === "invoice_payment") {
          setAdjustmentType("AGAINST_REF");
          setSelectedInvoiceId(unpaid[0].id);
          setReferenceName(unpaid[0].invoiceNumber);
          setAmount(((unpaid[0].amountDue ?? unpaid[0].total) / 100).toFixed(2));
        } else if (subType === "advance") {
          setAdjustmentType("NEW_REF");
          setReferenceName(`ADV-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`);
        } else {
          setAdjustmentType("ON_ACCOUNT");
        }
      })
      .catch((err) => console.error("Failed to load invoices", err))
      .finally(() => setLoadingInvoices(false));
  }, [contactId, subType]);

  // Handle invoice selection change
  function handleInvoiceSelect(invId: string) {
    setSelectedInvoiceId(invId);
    const inv = invoices.find((i) => i.id === invId);
    if (inv) {
      setReferenceName(inv.invoiceNumber);
      const due = (inv.amountDue ?? inv.total) / 100;
      setAmount(due.toFixed(2));
    }
  }

  // Keyboard shortcut: Ctrl + Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contactId, amount, date, bankAccountId, creditAccountId, adjustmentType, referenceName, selectedInvoiceId, narration, subType]);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid receipt amount greater than 0");
      return;
    }

    if (!bankAccountId) {
      toast.error("Please select a bank or cash account");
      return;
    }

    const isCustomerType = subType === "invoice_payment" || subType === "advance" || subType === "on_account";
    if (isCustomerType && !contactId) {
      toast.error("Please select a customer");
      return;
    }

    let resolvedCreditAccountId = creditAccountId;
    if (!resolvedCreditAccountId && isCustomerType) {
      const ar = accounts.find((a) => a.code === "1200" || a.subType === "receivable" || a.name.toLowerCase().includes("receivable"));
      if (ar) resolvedCreditAccountId = ar.id;
    }

    if (!resolvedCreditAccountId) {
      toast.error("Please select a credit ledger account");
      return;
    }

    const selectedBank = bankAccounts.find((b) => b.id === bankAccountId);
    const debitAccountId = selectedBank?.chartAccountId || selectedBank?.id;

    if (!debitAccountId) {
      toast.error("Selected bank account does not have a linked ledger account");
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
      const res = await fetch("/api/v1/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          date,
          description: narration || `Receipt - ${RECEIPT_SUBTYPES.find((s) => s.value === subType)?.label}`,
          voucherType: "RECEIPT",
          subType,
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
              adjustmentType,
              referenceName: adjustmentType === "AGAINST_REF" ? referenceName : adjustmentType === "NEW_REF" ? referenceName.trim() : null,
              referenceType: adjustmentType === "AGAINST_REF" ? "SALES_INVOICE" : null,
              referenceId: adjustmentType === "AGAINST_REF" ? selectedInvoiceId : null,
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save Receipt Voucher");
      }

      toast.success("Receipt Voucher posted successfully! ✓");
      router.push("/accounting/receipt");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Receipt Voucher");
    } finally {
      setSaving(false);
    }
  }

  const isCustomerReceipt = subType === "invoice_payment" || subType === "advance" || subType === "on_account";

  return (
    <div className="min-h-screen bg-[#e2ecf8] text-slate-800 pb-24 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top sticky navigation bar */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/accounting/receipt")}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl"
          >
            <ArrowLeft className="size-4 mr-1.5" />
            Back to Receipts
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-500/20">
              <ArrowDownLeft className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Receipt Voucher Terminal (F6)</h1>
              <p className="text-[11px] text-slate-500">Record payments, advances, & ledger receipts</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/accounting/receipt")}
            className="rounded-xl border-slate-200 hover:bg-slate-100 text-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={saving}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25 px-5 font-bold"
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
          {/* Voucher Details Card */}
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Voucher Date & Type</h2>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-500">Voucher Date (F2) *</Label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-800 font-bold text-xs px-3 rounded-xl border-2 border-slate-200 focus:border-emerald-600 outline-none transition-all cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-500">Receipt Subtype *</Label>
              <Select value={subType} onValueChange={setSubType}>
                <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200 h-10 text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 shadow-2xl z-[9999]">
                  {RECEIPT_SUBTYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Deposit Account (Debit) Card */}
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center gap-2">
              <Landmark className="size-4 text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Received Into Account *</h2>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-500">Bank / Cash Account (Debit Ledger)</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200 h-10 text-xs font-semibold">
                  <SelectValue placeholder="Select bank/cash..." />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 shadow-2xl z-[9999]">
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
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
              Funds received will instantly reflect in this account balance and cash flow statement.
            </p>
          </div>

          {/* Customer / Credit Account Card */}
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                {isCustomerReceipt ? "Customer Ledger *" : "Credit Ledger *"}
              </h2>
            </div>

            <ContactPicker
              id="receipt-form-customer-search-input"
              value={contactId}
              initialContactName={initialContactName}
              onChange={setContactId}
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

            {isCustomerReceipt ? (
              <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>Customer Ledger (1200 - AR)</span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-white text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                  Auto
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-500">Credit Ledger Account *</Label>
                <Select value={creditAccountId} onValueChange={setCreditAccountId}>
                  <SelectTrigger className="rounded-xl bg-slate-50 border-slate-200 h-10 text-xs">
                    <SelectValue placeholder="Select ledger..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 shadow-2xl z-[9999]">
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} - {a.name} ({a.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Bill-wise Adjustment Card */}
        {contactId && (
          <div className="rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-blue-600" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                  Method of Adjustment (Bill-wise Settlement)
                </h3>
              </div>
              {invoices.length > 0 && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  {invoices.length} Unpaid Invoice(s) Available
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {invoices.length > 0 && (
                <div
                  onClick={() => setAdjustmentType("AGAINST_REF")}
                  className={`cursor-pointer p-4 rounded-2xl border text-xs transition-all ${
                    adjustmentType === "AGAINST_REF"
                      ? "border-emerald-500 bg-emerald-50/80 font-bold shadow-xs ring-2 ring-emerald-500/20"
                      : "bg-slate-50 hover:bg-white border-slate-200"
                  }`}
                >
                  <div className="font-bold text-sm text-slate-900">Against Invoice (Agst Ref)</div>
                  <div className="text-[11px] text-slate-500 mt-1">Settle specific outstanding bill</div>
                </div>
              )}

              <div
                onClick={() => setAdjustmentType("NEW_REF")}
                className={`cursor-pointer p-4 rounded-2xl border text-xs transition-all ${
                  adjustmentType === "NEW_REF"
                    ? "border-emerald-500 bg-emerald-50/80 font-bold shadow-xs ring-2 ring-emerald-500/20"
                    : "bg-slate-50 hover:bg-white border-slate-200"
                }`}
              >
                <div className="font-bold text-sm text-slate-900">Advance Receipt (New Ref)</div>
                <div className="text-[11px] text-slate-500 mt-1">Create advance reference to adjust later</div>
              </div>

              <div
                onClick={() => setAdjustmentType("ON_ACCOUNT")}
                className={`cursor-pointer p-4 rounded-2xl border text-xs transition-all ${
                  adjustmentType === "ON_ACCOUNT"
                    ? "border-emerald-500 bg-emerald-50/80 font-bold shadow-xs ring-2 ring-emerald-500/20"
                    : "bg-slate-50 hover:bg-white border-slate-200"
                }`}
              >
                <div className="font-bold text-sm text-slate-900">On Account</div>
                <div className="text-[11px] text-slate-500 mt-1">Lump sum customer ledger credit</div>
              </div>
            </div>

            {/* Conditional Sub-input */}
            {adjustmentType === "AGAINST_REF" && invoices.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <Label className="text-[11px] font-bold text-slate-500">Select Invoice to Settle *</Label>
                <Select value={selectedInvoiceId} onValueChange={handleInvoiceSelect}>
                  <SelectTrigger className="bg-white rounded-xl h-10 border-slate-200 font-medium">
                    <SelectValue placeholder="Choose open invoice..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 shadow-2xl z-[9999]">
                    {invoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id} className="font-medium">
                        {inv.invoiceNumber} — Outstanding: {formatMoney(inv.amountDue ?? inv.total, inv.currencyCode || "INR")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {adjustmentType === "NEW_REF" && (
              <div className="space-y-1.5 pt-2 max-w-md">
                <Label className="text-[11px] font-bold text-slate-500">Advance Reference Name *</Label>
                <Input
                  placeholder="e.g. ADV-0001 or ADV-PO99"
                  className="bg-white rounded-xl h-10 border-slate-200 font-semibold"
                  value={referenceName}
                  onChange={(e) => setReferenceName(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {/* Amount & Narration Card */}
        <div className="grid gap-6 sm:grid-cols-12">
          {/* Amount Card (5 cols) */}
          <div className="sm:col-span-5 rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-3">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Amount Received (₹) *</Label>
            <Input
              id="receipt-form-amount-input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="text-2xl font-mono font-bold text-emerald-600 h-14 bg-slate-50 border-slate-200 focus:bg-white rounded-2xl"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">Total received via Cash / UPI / NEFT / Cheque.</p>
          </div>

          {/* Narration Card (7 cols) */}
          <div className="sm:col-span-7 rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-3">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Narration / Voucher Notes</Label>
            <Textarea
              rows={3}
              placeholder="e.g. Received via GPay UPI ref #829184 for order delivery, thank you..."
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="rounded-2xl border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium"
            />
          </div>
        </div>
      </main>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3.5 px-8 shadow-2xl flex items-center justify-between">
        <div className="text-xs text-slate-500 flex items-center gap-4">
          <span>
            Method: <strong className="text-slate-800">{adjustmentType}</strong>
          </span>
          <span className="h-3 w-px bg-slate-300" />
          <span>
            Total: <strong className="text-emerald-600 font-mono text-sm">₹{parseFloat(amount || "0").toFixed(2)}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/accounting/receipt")}
            className="rounded-xl border-slate-300 hover:bg-slate-100"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={saving}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25 px-6 font-bold"
          >
            {saving ? "Posting Voucher..." : "Post Receipt Voucher (Ctrl+Enter)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
