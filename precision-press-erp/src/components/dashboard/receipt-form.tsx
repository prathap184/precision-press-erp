"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowDownLeft, Info, Plus, CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/money";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subType?: string | null;
}

interface BankOption {
  id: string;
  name: string;
  chartAccountId: string;
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
  const [bankOptions, setBankOptions] = useState<BankOption[]>([]);
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

  useEffect(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const reqHeaders: Record<string, string> = {};
    if (orgId) reqHeaders["x-organization-id"] = orgId;

    Promise.all([
      fetch("/api/v1/bank-accounts", { headers: reqHeaders }).then((r) => r.json()),
      fetch("/api/v1/chart-accounts?limit=300", { headers: reqHeaders }).then((r) => r.json()),
    ])
      .then(([bankData, acctData]) => {
        const accts: Account[] = acctData.data || acctData.accounts || [];
        setAccounts(accts);

        // Build list of Cash & Bank accounts for "Received Into"
        const options: BankOption[] = [];
        const addedChartIds = new Set<string>();

        if (bankData.bankAccounts && Array.isArray(bankData.bankAccounts)) {
          bankData.bankAccounts.forEach((b: any) => {
            const chartId = b.chartAccountId || b.id;
            options.push({
              id: chartId,
              name: `${b.accountName} · ${b.currencyCode || "INR"}`,
              chartAccountId: chartId,
              currencyCode: b.currencyCode || "INR",
            });
            addedChartIds.add(chartId);
          });
        }

        accts.forEach((a) => {
          if (!addedChartIds.has(a.id)) {
            const lowerName = a.name.toLowerCase();
            if (a.subType === "bank" || (a.type === "asset" && (lowerName.includes("bank") || lowerName.includes("cash")))) {
              options.push({
                id: a.id,
                name: `${a.name} · INR`,
                chartAccountId: a.id,
                currencyCode: "INR",
              });
              addedChartIds.add(a.id);
            }
          }
        });

        setBankOptions(options);

        if (options.length > 0) {
          setBankAccountId(options[0].id);
        }

        const ar = accts.find((a: Account) => a.code === "1200" || a.subType === "receivable" || a.name.toLowerCase().includes("receivable"));
        if (ar) setCreditAccountId(ar.id);
      })
      .catch((err) => console.error("Failed to load initial ledger options", err));
  }, []);

  // Update default Credit Account when Subtype changes
  useEffect(() => {
    if (accounts.length === 0) return;

    if (["invoice_payment", "advance", "on_account"].includes(subType)) {
      const ar = accounts.find((a) => a.code === "1200" || a.subType === "receivable" || a.name.toLowerCase().includes("receivable"));
      if (ar) setCreditAccountId(ar.id);
    } else if (subType === "security_deposit") {
      const liab = accounts.find((a) => a.type === "liability" || a.name.toLowerCase().includes("deposit"));
      if (liab) setCreditAccountId(liab.id);
    } else if (subType === "loan_received") {
      const loan = accounts.find((a) => a.type === "liability" || a.name.toLowerCase().includes("loan"));
      if (loan) setCreditAccountId(loan.id);
    }
  }, [subType, accounts]);

  // Fetch customer outstanding invoices when contact selected
  useEffect(() => {
    if (!contactId) {
      setInvoices([]);
      setSelectedInvoiceId("");
      return;
    }
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const reqHeaders: Record<string, string> = {};
    if (orgId) reqHeaders["x-organization-id"] = orgId;

    setLoadingInvoices(true);
    fetch(`/api/v1/invoices?contactId=${contactId}&limit=100`, {
      headers: reqHeaders,
    })
      .then((r) => r.json())
      .then((data) => {
        const list = data.data || data.invoices || [];
        const unpaid = list.filter((inv: any) =>
          ["sent", "partial", "overdue"].includes(inv.status) && inv.amountDue > 0
        );
        setInvoices(unpaid);
        if (unpaid.length === 0) {
          setAdjustmentType("NEW_REF");
        } else {
          setAdjustmentType("AGAINST_REF");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingInvoices(false));
  }, [contactId]);

  const handleInvoiceSelect = (invId: string) => {
    setSelectedInvoiceId(invId);
    const inv = invoices.find((i) => i.id === invId);
    if (inv) {
      setAmount((inv.amountDue / 100).toFixed(2));
      setReferenceName(inv.invoiceNumber);
    }
  };

  const isCustomerReceipt = ["invoice_payment", "advance", "on_account"].includes(subType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isCustomerReceipt && !contactId) {
      toast.error("Please select a customer");
      return;
    }
    if (!bankAccountId) {
      toast.error("Please select the Cash / Bank account money was received into");
      return;
    }
    const selectedBank = bankOptions.find((b) => b.id === bankAccountId);
    const debitAccountId = selectedBank?.chartAccountId || bankAccountId;
    if (!debitAccountId) {
      toast.error("Please select a valid Cash/Bank account");
      return;
    }
    if (!creditAccountId) {
      toast.error("Please select the ledger account to credit");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (adjustmentType === "AGAINST_REF" && !selectedInvoiceId) {
      toast.error("Please select an invoice to settle against");
      return;
    }

    if (adjustmentType === "NEW_REF" && !referenceName.trim()) {
      toast.error("Please provide a Reference Name (e.g. ADV-0001)");
      return;
    }

    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (orgId) reqHeaders["x-organization-id"] = orgId;

    setSaving(true);
    const cents = Math.round(numAmount * 100);

    try {
      const res = await fetch("/api/v1/entries", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          date,
          description: narration || `Receipt - ${RECEIPT_SUBTYPES.find((s) => s.value === subType)?.label}`,
          voucherType: "RECEIPT",
          subType,
          status: "posted",
          sourceModule: "RECEIPT",
          lines: [
            {
              // Debit: Money IN to Cash/Bank
              accountId: debitAccountId,
              debitAmount: cents,
              creditAmount: 0,
              currencyCode: "INR",
            },
            {
              // Credit: Money FROM Customer / Income
              accountId: creditAccountId,
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
      router.push("/accounting/sales/customer-prepayments");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Receipt Voucher");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6 bg-card p-6 rounded-2xl border shadow-sm">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
            <ArrowDownLeft className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Receipt Voucher (F6)</h2>
            <p className="text-xs text-muted-foreground">Record incoming funds from customers, advance receipts, or income.</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground block">Voucher Type</span>
          <span className="font-mono text-sm font-bold text-emerald-600">RECEIPT (F6)</span>
        </div>
      </div>

      {/* Basic Info Grid */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Voucher Date *</Label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <div className="space-y-2">
          <Label>Receipt Subtype *</Label>
          <Select value={subType} onValueChange={setSubType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RECEIPT_SUBTYPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Received Into (Debit Account) *</Label>
          <Select value={bankAccountId} onValueChange={setBankAccountId}>
            <SelectTrigger><SelectValue placeholder="Select bank/cash..." /></SelectTrigger>
            <SelectContent>
              {bankOptions.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
              {bankOptions.length === 0 && (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No bank or cash accounts found
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="h-px bg-border my-2" />

      {/* Customer & Ledger Selection */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{isCustomerReceipt ? "Received From (Customer) *" : "Contact / Payer (Optional)"}</Label>
          <ContactPicker value={contactId} onChange={setContactId} type="customer" />
        </div>

        {isCustomerReceipt ? (
          <div className="space-y-2">
            <Label>Credit Ledger Account</Label>
            <div className="p-3 bg-muted/30 border rounded-lg flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Customer Account Statement (Auto-Credited)</span>
              </div>
              <span className="text-xs font-mono font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                1200 - AR
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Credit Ledger Account *</Label>
            <Select value={creditAccountId} onValueChange={setCreditAccountId}>
              <SelectTrigger><SelectValue placeholder="Select ledger..." /></SelectTrigger>
              <SelectContent>
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

      {/* Bill-wise Details Panel */}
      {contactId && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Method of Adjustment (Bill-wise Details)
            </h3>
            {invoices.length > 0 && (
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                {invoices.length} Open Invoice(s) Available
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {invoices.length > 0 && (
              <div
                onClick={() => setAdjustmentType("AGAINST_REF")}
                className={`cursor-pointer p-3 rounded-lg border text-sm transition-all ${
                  adjustmentType === "AGAINST_REF" ? "border-emerald-500 bg-emerald-50/50 font-medium" : "bg-card hover:bg-muted/40"
                }`}
              >
                <div className="font-semibold">Against Invoice</div>
                <div className="text-xs text-muted-foreground mt-0.5">Settle against existing invoice</div>
              </div>
            )}

            <div
              onClick={() => setAdjustmentType("NEW_REF")}
              className={`cursor-pointer p-3 rounded-lg border text-sm transition-all ${
                adjustmentType === "NEW_REF" ? "border-emerald-500 bg-emerald-50/50 font-medium" : "bg-card hover:bg-muted/40"
              }`}
            >
              <div className="font-semibold">Advance (New Ref)</div>
              <div className="text-xs text-muted-foreground mt-0.5">Create new reference (e.g. ADV-0001)</div>
            </div>

            <div
              onClick={() => setAdjustmentType("ON_ACCOUNT")}
              className={`cursor-pointer p-3 rounded-lg border text-sm transition-all ${
                adjustmentType === "ON_ACCOUNT" ? "border-emerald-500 bg-emerald-50/50 font-medium" : "bg-card hover:bg-muted/40"
              }`}
            >
              <div className="font-semibold">On Account</div>
              <div className="text-xs text-muted-foreground mt-0.5">Lump sum, no reference label</div>
            </div>
          </div>

          {/* Conditional Input based on Adjustment Type */}
          {adjustmentType === "AGAINST_REF" && invoices.length > 0 && (
            <div className="space-y-2 pt-2">
              <Label>Select Invoice to Settle *</Label>
              <Select value={selectedInvoiceId} onValueChange={handleInvoiceSelect}>
                <SelectTrigger className="bg-white"><SelectValue placeholder="Choose open invoice..." /></SelectTrigger>
                <SelectContent>
                  {invoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — Outstanding: {formatMoney(inv.amountDue, inv.currencyCode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {adjustmentType === "NEW_REF" && (
            <div className="space-y-2 pt-2">
              <Label>Reference Name / Number *</Label>
              <Input
                placeholder="e.g. ADV-0001 or ADV-JULY"
                className="bg-white max-w-sm"
                value={referenceName}
                onChange={(e) => setReferenceName(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* Amount & Narration */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Amount (₹) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            className="text-lg font-mono font-bold text-emerald-600"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Narration / Description</Label>
          <Textarea
            rows={2}
            placeholder="Additional notes for this receipt..."
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Post Receipt Voucher (F6)
        </Button>
      </div>
    </form>
  );
}
