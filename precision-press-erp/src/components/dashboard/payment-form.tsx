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
import { Loader2, ArrowUpRight, Info, Plus } from "lucide-react";
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

const PAYMENT_SUBTYPES = [
  { value: "supplier_payment", label: "Supplier Payment" },
  { value: "customer_refund", label: "Customer Refund" },
  { value: "expense", label: "Expense Payment" },
  { value: "salary", label: "Salary / Payroll Payout" },
  { value: "employee_advance", label: "Employee Advance" },
  { value: "employee_reimbursement", label: "Employee Reimbursement" },
  { value: "loan_repayment", label: "Loan Repayment" },
  { value: "tax_payment", label: "Tax Payment" },
];

export function PaymentForm() {
  const router = useRouter();

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentType, setPaymentType] = useState("customer_refund");
  const [contactId, setContactId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debitAccountId, setDebitAccountId] = useState("");
  const [amount, setAmount] = useState("0.00");
  const [narration, setNarration] = useState("");

  // Customer advance balance panel
  const [customerAdvance, setCustomerAdvance] = useState<number | null>(null);
  const [loadingAdvance, setLoadingAdvance] = useState(false);

  // Bill-wise Adjustment State
  const [adjustmentType, setAdjustmentType] = useState<"AGAINST_REF" | "NEW_REF" | "ON_ACCOUNT">("ON_ACCOUNT");
  const [referenceName, setReferenceName] = useState("");

  const [saving, setSaving] = useState(false);

  // Fetch Bank Accounts & Chart Accounts
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

    fetch("/api/v1/chart-accounts?limit=300", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((acctData) => {
        const accts: Account[] = acctData.data || acctData.accounts || [];
        setAccounts(accts);
        const ar = accts.find((a) => a.code === "1200" || a.subType === "receivable" || a.name.toLowerCase().includes("receivable"));
        if (ar) setDebitAccountId(ar.id);
      })
      .catch((err) => console.error("Failed to load chart accounts", err));
  }, []);

  // Auto-select default ledger when Payment Type changes while showing ALL ledgers in dropdown
  useEffect(() => {
    if (accounts.length === 0) return;

    if (paymentType === "supplier_payment") {
      const ap = accounts.find((a) => a.code === "2100" || a.subType === "payable" || a.name.toLowerCase().includes("payable"));
      if (ap) setDebitAccountId(ap.id);
    } else if (paymentType === "customer_refund") {
      const ar = accounts.find((a) => a.code === "1200" || a.subType === "receivable" || a.name.toLowerCase().includes("receivable") || a.name.toLowerCase().includes("advance"));
      if (ar) setDebitAccountId(ar.id);
    } else if (paymentType === "expense") {
      const exp = accounts.find((a) => a.type === "expense" || a.code.startsWith("5"));
      if (exp) setDebitAccountId(exp.id);
    } else if (paymentType === "salary") {
      const sal = accounts.find((a) => a.name.toLowerCase().includes("salary") || a.name.toLowerCase().includes("payroll") || a.type === "expense");
      if (sal) setDebitAccountId(sal.id);
    }
  }, [paymentType, accounts]);

  // Fetch customer advance balance when contact is selected and paymentType is customer_refund
  useEffect(() => {
    if (paymentType !== "customer_refund" || !contactId) {
      setCustomerAdvance(null);
      return;
    }
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setLoadingAdvance(true);
    fetch(`/api/v1/customer-credits?contactId=${contactId}&status=open&limit=100`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const credits = data.data || [];
        const total = credits.reduce((sum: number, c: { amountRemaining: number }) => sum + c.amountRemaining, 0);
        setCustomerAdvance(total);
      })
      .catch(() => setCustomerAdvance(null))
      .finally(() => setLoadingAdvance(false));
  }, [contactId, paymentType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((paymentType === "customer_refund" || paymentType === "supplier_payment") && !contactId) {
      toast.error(`Please select a ${paymentType === "customer_refund" ? "customer" : "supplier"}`);
      return;
    }
    if (!bankAccountId) {
      toast.error("Please select the Cash / Bank account money was paid out from");
      return;
    }
    const selectedBank = bankAccounts.find((b) => b.id === bankAccountId);
    const creditAccountId = selectedBank?.chartAccountId || selectedBank?.id;
    if (!creditAccountId) {
      toast.error("The selected bank account is not linked to a ledger.");
      return;
    }

    if (!debitAccountId) {
      toast.error("Please select the ledger account to debit");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (adjustmentType === "NEW_REF" && !referenceName.trim()) {
      toast.error("Please provide a Reference Name (e.g. REFUND-0001)");
      return;
    }

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

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
          description: narration || `Payment - ${PAYMENT_SUBTYPES.find((p) => p.value === paymentType)?.label}`,
          voucherType: "PAYMENT",
          subType: paymentType,
          status: "posted",
          sourceModule: "PAYMENT",
          lines: [
            {
              // Debit: Money OUT to Customer/Supplier/Expense
              accountId: debitAccountId,
              debitAmount: cents,
              creditAmount: 0,
              currencyCode: "INR",
              contactId: contactId || null,
              adjustmentType,
              referenceName: adjustmentType === "NEW_REF" ? referenceName.trim() : null,
            },
            {
              // Credit: Money FROM Cash/Bank
              accountId: creditAccountId,
              debitAmount: 0,
              creditAmount: cents,
              currencyCode: "INR",
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save Payment Voucher");
      }

      toast.success("Payment Voucher posted successfully! ✓");
      router.push("/accounting/payment/registry");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Payment Voucher");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6 bg-card p-6 rounded-2xl border shadow-sm">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
            <ArrowUpRight className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Payment Voucher (F5)</h2>
            <p className="text-xs text-muted-foreground">Record outgoing funds to vendors, customer refunds, or expenses.</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground block">Voucher Type</span>
          <span className="font-mono text-sm font-bold text-rose-600">PAYMENT (F5)</span>
        </div>
      </div>

      {/* Basic Info Grid */}
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Voucher Date *</Label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <div className="space-y-2">
          <Label>Payment Type *</Label>
          <Select value={paymentType} onValueChange={setPaymentType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_SUBTYPES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Paid From (Credit Account) *</Label>
          <Select value={bankAccountId} onValueChange={setBankAccountId}>
            <SelectTrigger><SelectValue placeholder="Select bank/cash..." /></SelectTrigger>
            <SelectContent>
              {bankAccounts.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.accountName} · {b.currencyCode || "INR"}
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
      </div>

      <div className="h-px bg-border my-2" />

      {/* Contact & Ledger Selection */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{paymentType === "customer_refund" ? "Customer *" : paymentType === "supplier_payment" ? "Supplier *" : "Contact / Payee (Optional)"}</Label>
          <ContactPicker
            value={contactId}
            onChange={setContactId}
            type={paymentType === "customer_refund" ? "customer" : "supplier"}
          />
        </div>

        <div className="space-y-2">
          <Label>Debit Ledger Account *</Label>
          <Select value={debitAccountId} onValueChange={setDebitAccountId}>
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
      </div>

      {/* Customer Refund Advance Balance Panel */}
      {paymentType === "customer_refund" && contactId && (
        <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">Customer Refundable Advance</span>
            </div>
            {loadingAdvance ? (
              <span className="text-xs text-muted-foreground">Checking advance balance...</span>
            ) : customerAdvance !== null && customerAdvance > 0 ? (
              <span className="font-mono text-sm font-bold text-amber-900 dark:text-amber-100">
                {formatMoney(customerAdvance, "INR")}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No open advance balance found.</span>
            )}
          </div>
        </div>
      )}

      {/* Method of Adjustment Panel */}
      <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
        <Label className="text-sm font-semibold">Method of Adjustment</Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div
            onClick={() => setAdjustmentType("ON_ACCOUNT")}
            className={`cursor-pointer p-3 rounded-lg border text-sm transition-all ${
              adjustmentType === "ON_ACCOUNT" ? "border-rose-500 bg-rose-50/50 font-medium" : "bg-card hover:bg-muted/40"
            }`}
          >
            <div className="font-semibold">On Account</div>
            <div className="text-xs text-muted-foreground mt-0.5">Standard payment payout</div>
          </div>

          <div
            onClick={() => setAdjustmentType("NEW_REF")}
            className={`cursor-pointer p-3 rounded-lg border text-sm transition-all ${
              adjustmentType === "NEW_REF" ? "border-rose-500 bg-rose-50/50 font-medium" : "bg-card hover:bg-muted/40"
            }`}
          >
            <div className="font-semibold">New Ref (Named Reference)</div>
            <div className="text-xs text-muted-foreground mt-0.5">Trackable reference e.g. REFUND-001</div>
          </div>
        </div>

        {adjustmentType === "NEW_REF" && (
          <div className="space-y-2 pt-2">
            <Label>Reference Name / Number *</Label>
            <Input
              placeholder="e.g. REFUND-0001 or EXP-ADV-01"
              className="bg-white max-w-sm"
              value={referenceName}
              onChange={(e) => setReferenceName(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Amount & Narration */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Amount (₹) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            className="text-lg font-mono font-bold text-rose-600"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Narration / Description</Label>
          <Textarea
            rows={2}
            placeholder="Additional notes for this payment..."
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving} className="bg-rose-600 hover:bg-rose-700">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Post Payment Voucher (F5)
        </Button>
      </div>
    </form>
  );
}
