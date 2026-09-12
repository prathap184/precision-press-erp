"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  ArrowLeft,
  Calendar,
  Save,
  Truck,
  Building2,
  Receipt,
  Sparkles,
  Percent,
  CheckCircle2,
  Plus,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { LineItemsEditor, type LineItem } from "@/components/dashboard/line-items-editor";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

interface SavedAddress {
  label: string;
  address: string;
}

function normalizeDeliveryMode(mode?: string): string {
  if (!mode) return "PICKUP";
  const m = mode.trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (m.includes("DOOR")) return "DOOR";
  if (m.includes("PICK") || m.includes("COUNTER") || m.includes("SELF")) return "PICKUP";
  if (m.includes("COUR")) return "COURIER";
  if (m.includes("TRANS")) return "TRANSPORT";
  return mode;
}

export function InvoiceFormView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openDrawer } = useCreateDrawer();

  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [initialContactName, setInitialContactName] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // Deposit / retainer invoice options
  const [isDepositRetainer, setIsDepositRetainer] = useState(false);
  const [invoiceType, setInvoiceType] = useState<"deposit" | "retainer">("deposit");
  const [depositPercent, setDepositPercent] = useState("");
  const [forApproval, setForApproval] = useState(false);

  // Logistics
  const [deliveryMode, setDeliveryMode] = useState<string>("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

  // Line items
  const [lines, setLines] = useState<LineItem[]>([
    { description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" },
  ]);

  // Ref type: NEW_REF vs AGST_REF
  const [refType, setRefType] = useState<"NEW_REF" | "AGST_REF">("NEW_REF");
  const [availableCredits, setAvailableCredits] = useState<
    { id: string; referenceNumber?: string; reference?: string; notes?: string; amountRemaining: number; journalEntry?: any }[]
  >([]);
  const [selectedCreditId, setSelectedCreditId] = useState("");

  // Pre-fill state from Global Orders / sessionStorage / URL params on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("pending_invoice_draft");
      if (stored) {
        sessionStorage.removeItem("pending_invoice_draft");
        const data = JSON.parse(stored);
        if (data.contactId) setContactId(data.contactId);
        if (data.contactName) setInitialContactName(data.contactName);
        if (data.reference) setReference(data.reference);
        if (data.deliveryMode) setDeliveryMode(normalizeDeliveryMode(data.deliveryMode));
        if (data.deliveryAddress) setDeliveryAddress(data.deliveryAddress);
        if (data.notes) setNotes(data.notes);
        if (Array.isArray(data.lines) && data.lines.length > 0) {
          setLines(
            data.lines.map((l: any) => ({
              description: l.description || "",
              quantity: String(l.quantity ?? "1"),
              unitPrice: String(l.unitPrice ?? ""),
              billingMode: l.billingMode || undefined,
              pcsNo: l.pcsNo ? String(l.pcsNo) : undefined,
              accountId: l.accountId || "",
              taxRateId: l.taxRateId || "",
              inventoryItemId: l.inventoryItemId || undefined,
              width: l.width ? String(l.width) : undefined,
              length: l.length ? String(l.length) : undefined,
              sqFt: l.sqFt ? String(l.sqFt) : undefined,
              finishAmount: l.finishAmount ? String(l.finishAmount) : undefined,
              deliveryMode: l.deliveryMode || undefined,
              deliveryAmount: l.deliveryAmount ? String(l.deliveryAmount) : undefined,
            }))
          );
        }
        return;
      }

      // Check URL parameters fallback
      const urlContactId = searchParams?.get("contactId");
      const urlContactName = searchParams?.get("contactName");
      const urlRef = searchParams?.get("ref") || searchParams?.get("reference") || searchParams?.get("orderId");
      if (urlContactId) setContactId(urlContactId);
      if (urlContactName) setInitialContactName(urlContactName);
      if (urlRef) setReference(urlRef);
    } catch (e) {
      console.error("Failed to load invoice draft", e);
    }
  }, [searchParams]);

  // Auto-focus customer input on mount if empty
  useEffect(() => {
    setTimeout(() => {
      const el = document.getElementById("invoice-page-customer-search-input") as HTMLInputElement;
      if (el && !contactId) {
        el.focus();
        try {
          el.select();
        } catch {}
      }
    }, 150);
  }, [contactId]);

  // Fetch saved customer addresses
  useEffect(() => {
    if (!contactId) {
      setSavedAddresses([]);
      return;
    }
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    fetch(`/api/v1/contacts/${contactId}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        const c = data.contact;
        if (c) {
          const list: SavedAddress[] = [];
          const seen = new Set<string>();
          const add = (label: string, addrStr: string) => {
            const clean = addrStr.replace(/^[,\s]+|[,\s]+$/g, "").replace(/\s*,\s*/g, ", ");
            if (clean && !seen.has(clean)) {
              seen.add(clean);
              list.push({ label, address: clean });
            }
          };

          if (c.billing_address_line1 || c.billing_address_line2 || c.billing_city) {
            const p1 = [
              c.billing_address_line1,
              c.billing_address_line2,
              c.billing_city,
              c.billing_state,
              c.billing_pincode || c.billing_postalCode,
            ]
              .filter(Boolean)
              .join(", ");
            add("Billing Address", p1);
          }
          if (c.shipping_address_line1 || c.shipping_address_line2 || c.shipping_city) {
            const p2 = [
              c.shipping_address_line1,
              c.shipping_address_line2,
              c.shipping_city,
              c.shipping_state,
              c.shipping_pincode || c.shipping_postalCode,
            ]
              .filter(Boolean)
              .join(", ");
            add("Shipping Address", p2);
          }
          if (Array.isArray(c.addresses)) {
            c.addresses.forEach((addr: any, i: number) => {
              if (typeof addr === "string") {
                add(`Address ${i + 1}`, addr);
              } else if (addr && typeof addr === "object") {
                const parts = [
                  addr.houseNumber || addr.line1 || addr.street,
                  addr.roadName || addr.line2,
                  addr.city,
                  addr.state,
                  addr.pincode || addr.postalCode,
                  addr.country,
                ]
                  .filter(Boolean)
                  .join(", ");
                add(addr.type || `Address ${i + 1}`, parts);
              }
            });
          }

          setSavedAddresses(list);
          if (list.length > 0 && !deliveryAddress) {
            setDeliveryAddress(list[0].address);
          }
        }
      })
      .catch(() => {});
  }, [contactId]);

  // Load customer credits if AGST_REF
  useEffect(() => {
    if (refType !== "AGST_REF" || !contactId) {
      setAvailableCredits([]);
      setSelectedCreditId("");
      return;
    }
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;
    fetch(`/api/v1/customer-credits?contactId=${contactId}&status=open`, { headers })
      .then((r) => r.json())
      .then((data) => {
        const list = data.data || [];
        setAvailableCredits(list);
        if (list.length > 0 && !selectedCreditId) {
          setSelectedCreditId(list[0].id);
        }
      })
      .catch(() => {});
  }, [refType, contactId]);

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
  }, [contactId, refType, selectedCreditId, lines, issueDate, dueDate, reference, notes, isDepositRetainer, depositPercent, forApproval, deliveryMode, deliveryAddress]);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!contactId) {
      toast.error("Please select a customer");
      return;
    }
    if (refType === "AGST_REF" && !selectedCreditId) {
      toast.error("Please select an advance receipt to settle against");
      return;
    }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) {
      toast.error("Organization not found");
      setSaving(false);
      return;
    }

    const pct = parseFloat(depositPercent);
    const depositBasisPoints =
      isDepositRetainer && depositPercent.trim() !== "" && !Number.isNaN(pct)
        ? Math.round(pct * 100)
        : null;

    try {
      const res = await fetch("/api/v1/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId,
          issueDate,
          dueDate,
          reference: reference || null,
          notes:
            [
              deliveryMode ? `Delivery Mode: ${deliveryMode}` : "",
              deliveryAddress ? `Delivery Address: ${deliveryAddress}` : "",
              notes,
            ]
              .filter(Boolean)
              .join("\n\n") || null,
          invoiceType: isDepositRetainer ? invoiceType : "standard",
          depositPercent: isDepositRetainer ? depositBasisPoints : null,
          ...(forApproval ? { submitForApproval: true } : {}),
          referenceType: refType,
          ...(refType === "AGST_REF" && selectedCreditId ? { advanceCreditId: selectedCreditId } : {}),
          lines: lines.map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            billingMode: l.billingMode || null,
            pcsNo: parseFloat(l.pcsNo || "1") || null,
            accountId: l.accountId || null,
            taxRateId: l.taxRateId || null,
            inventoryItemId: l.inventoryItemId || null,
            width: parseFloat(l.width || "0") || null,
            length: parseFloat(l.length || "0") || null,
            sqFt: parseFloat(l.sqFt || "0") || null,
            finishAmount: parseFloat(l.finishAmount || "0") || null,
            deliveryMode: l.deliveryMode || null,
            deliveryAmount: parseFloat(l.deliveryAmount || "0") || null,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create invoice");
      }

      const data = await res.json();
      const inv = data.invoice;
      toast.success(
        inv.status === "pending_approval"
          ? "Invoice saved for approval!"
          : inv.status === "paid"
          ? "Invoice created & fully settled via advance!"
          : inv.status === "partial"
          ? "Invoice created — partially settled via advance"
          : "Invoice created successfully"
      );
      router.push(`/accounting/sales/${inv.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#e2ecf8] text-slate-800 pb-24 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top sticky navigation bar */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/accounting/sales")}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl"
          >
            <ArrowLeft className="size-4 mr-1.5" />
            Back to Invoices
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <FileText className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Sales Invoice Terminal</h1>
              <p className="text-[11px] text-slate-500">Fast keyboard entry (Tally-speed)</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/accounting/sales")}
            className="rounded-xl border-slate-200 hover:bg-slate-100 text-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={saving}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 px-5 font-bold"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="size-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="size-4" />
                Create Invoice (Ctrl+Enter)
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Main Terminal Container */}
      <main className="max-w-[1500px] mx-auto p-6 sm:p-8 space-y-6">
        {/* Top Section: Customer Card & Logistics */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Customer Card (7 cols) */}
          <div className="lg:col-span-7 rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-blue-600" />
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Customer Details *</h2>
              </div>
              <button
                type="button"
                onClick={() => openDrawer("contact")}
                className="text-[11px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
              >
                + New Customer
              </button>
            </div>

            <ContactPicker
              id="invoice-page-customer-search-input"
              value={contactId}
              initialContactName={initialContactName}
              onChange={(id) => {
                setContactId(id);
              }}
              type="customer"
              onSelectAdvance={() => {
                const refInput = document.getElementById("invoice-page-reference-input") as HTMLElement;
                if (refInput) {
                  refInput.focus();
                } else {
                  const itemInput = document.getElementById("row-0-product-input") || (document.querySelector('input[placeholder="Select item..."]') as HTMLElement);
                  if (itemInput) itemInput.focus();
                }
              }}
            />

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="invoice-page-reference-input" className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Customer Reference / PO Number
              </Label>
              <Input
                id="invoice-page-reference-input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const itemInput =
                      document.getElementById("row-0-product-input") ||
                      (document.querySelector('input[placeholder="Select item..."]') as HTMLElement);
                    if (itemInput) itemInput.focus();
                  } else if (e.key === "Backspace" && (e.currentTarget.selectionStart === 0 || !e.currentTarget.value)) {
                    e.preventDefault();
                    const custInput = document.getElementById("invoice-page-customer-search-input");
                    if (custInput) custInput.focus();
                  }
                }}
                placeholder="e.g. PO-8842, Work Order 29..."
                className="h-10 text-xs rounded-xl bg-slate-50 border-slate-200 focus:bg-white font-medium placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Dates & Reference Pill Card (5 cols) */}
          <div className="lg:col-span-5 rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-blue-600" />
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Dates & Reference Type</h2>
            </div>

            {/* Reference Type Pills */}
            <div className="flex gap-2">
              <button
                id="ref-type-new-btn"
                type="button"
                tabIndex={0}
                onClick={() => {
                  setRefType("NEW_REF");
                  setSelectedCreditId("");
                  setAvailableCredits([]);
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                  refType === "NEW_REF"
                    ? "bg-slate-900 text-white shadow-md ring-2 ring-blue-500/50"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                New Ref (Normal Bill)
              </button>
              <button
                id="ref-type-agst-btn"
                type="button"
                tabIndex={0}
                onClick={() => setRefType("AGST_REF")}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                  refType === "AGST_REF"
                    ? "bg-amber-600 text-white shadow-md ring-2 ring-amber-500/50"
                    : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                }`}
              >
                Agst Ref (Settle Advance)
              </button>
            </div>

            {/* If AGST_REF, show advance credit selector */}
            {refType === "AGST_REF" && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                <Label className="text-[11px] font-bold text-amber-900 uppercase tracking-wide">
                  Select Advance Receipt *
                </Label>
                {availableCredits.length === 0 && (
                  <p className="text-xs text-amber-800 font-medium">
                    {contactId ? "No open advance receipts found for this customer." : "Select customer first."}
                  </p>
                )}
                {availableCredits.length > 0 && (
                  <Select value={selectedCreditId} onValueChange={setSelectedCreditId}>
                    <SelectTrigger className="w-full bg-white text-slate-900 border-amber-200 font-semibold shadow-xs h-9 px-3 rounded-xl">
                      <SelectValue placeholder="Pick an advance receipt..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-slate-200 shadow-2xl z-[9999]">
                      {availableCredits.map((c) => {
                        const refName =
                          c.journalEntry?.reference ||
                          c.journalEntry?.entryNumber ||
                          c.referenceNumber ||
                          c.reference ||
                          c.notes ||
                          "Advance";
                        return (
                          <SelectItem key={c.id} value={c.id} className="font-medium">
                            {refName} · Available: ₹{(c.amountRemaining / 100).toFixed(2)}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Date Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="invoice-page-issue-date" className="text-[11px] font-bold text-slate-500">
                  Issue Date (F2)
                </Label>
                <input
                  id="invoice-page-issue-date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="h-10 w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-800 font-bold text-xs px-3 rounded-xl border-2 border-slate-200 focus:border-blue-600 outline-none transition-all cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="invoice-page-due-date" className="text-[11px] font-bold text-slate-500">
                  Due Date
                </Label>
                <input
                  id="invoice-page-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-10 w-full bg-slate-50 hover:bg-white focus:bg-white text-slate-800 font-bold text-xs px-3 rounded-xl border-2 border-slate-200 focus:border-blue-600 outline-none transition-all cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ORDER ITEMS TABLE CARD */}
        <div className="rounded-[2rem] bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-blue-600" />
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Invoice Items</h2>
            </div>
            <span className="text-xs font-medium text-slate-400">
              Type product name or select from windowed 100-item stock catalog
            </span>
          </div>

          <LineItemsEditor lines={lines} onChange={setLines} accountTypeFilter={["revenue"]} taxContext="sales" />
        </div>

        {/* LOGISTICS & NOTES SECTION */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
          {/* Logistics (7 cols) */}
          <div className="lg:col-span-7 rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="size-4 text-blue-600" />
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Logistics & Delivery</h2>
              </div>
              {savedAddresses.length > 0 && (
                <Select
                  onValueChange={(val) => {
                    if (val === "CUSTOM") return;
                    setDeliveryAddress(val);
                  }}
                >
                  <SelectTrigger className="h-7 text-[11px] w-[160px] bg-blue-50 text-blue-700 border-blue-200 rounded-lg">
                    <SelectValue placeholder="Saved address..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-slate-200 shadow-2xl z-[9999]">
                    {savedAddresses.map((a, idx) => (
                      <SelectItem key={idx} value={a.address}>
                        <span className="font-bold">{a.label}:</span> <span className="text-xs">{a.address}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Mode selection buttons */}
            <div className="grid grid-cols-4 gap-2 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/50">
              {(["PICKUP", "DOOR", "COURIER", "TRANSPORT"] as const).map((mode) => {
                const isActive = deliveryMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setDeliveryMode(mode);
                      if (mode !== "PICKUP" && savedAddresses.length > 0 && !deliveryAddress) {
                        setDeliveryAddress(savedAddresses[0].address);
                      }
                    }}
                    className={`py-2 text-[11px] font-black tracking-wider uppercase rounded-xl transition-all ${
                      isActive
                        ? "bg-slate-900 text-white shadow-md ring-2 ring-blue-500/50"
                        : "text-slate-500 hover:text-slate-900 hover:bg-white/60"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>

            {/* Address input */}
            {deliveryMode !== "PICKUP" && (
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Delivery Destination Address
                </Label>
                <Input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Street, City, Pincode, Landmark..."
                  className="h-10 text-xs rounded-xl bg-white border-slate-200 focus:bg-white font-medium placeholder:text-slate-400"
                />
              </div>
            )}

            {deliveryMode === "PICKUP" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 font-medium">
                Self Pickup — customer collects order from shop counter.
              </div>
            )}
          </div>

          {/* Notes & Extra Options (5 cols) */}
          <div className="lg:col-span-5 rounded-[2rem] bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/80 space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Notes & Settings</h2>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold text-slate-500">Notes to Customer / Remarks</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Specific instructions, job details, delivery notes..."
                rows={3}
                className="rounded-xl border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={forApproval}
                  onChange={(e) => setForApproval(e.target.checked)}
                  className="size-4 accent-blue-600 rounded"
                />
                <span>Submit for Manager Approval</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={isDepositRetainer}
                  onChange={(e) => setIsDepositRetainer(e.target.checked)}
                  className="size-4 accent-blue-600 rounded"
                />
                <span>Deposit / Retainer</span>
              </label>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3.5 px-8 shadow-2xl flex items-center justify-between">
        <div className="text-xs text-slate-500 flex items-center gap-4">
          <span>
            Items: <strong className="text-slate-800">{lines.length}</strong>
          </span>
          <span className="h-3 w-px bg-slate-300" />
          <span>
            Reference: <strong className="text-slate-800">{refType === "AGST_REF" ? "Against Advance" : "New Bill"}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/accounting/sales")}
            className="rounded-xl border-slate-300 hover:bg-slate-100"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSubmit()}
            disabled={saving}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 px-6 font-bold"
          >
            {saving ? "Creating Invoice..." : "Create Invoice (Ctrl+Enter)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
