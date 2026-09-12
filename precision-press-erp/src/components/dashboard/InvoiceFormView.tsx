"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
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
  Trash2,
  Search,
  ChevronDown,
  Loader2,
  X,
  CreditCard,
  ShieldCheck,
  Check,
} from "lucide-react";
import { RoleGuard } from "@/lib/role-guard";
import { ItemDescriptionModal } from "@/components/dashboard/ItemDescriptionModal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

interface SavedAddress {
  label: string;
  address: string;
}

interface InvoiceRow {
  id: string;
  productId: string;
  productName: string;
  description: string;
  hsnCode: string;
  billingMode?: "A" | "B";
  pcsNo: string;
  width: string;
  widthUnit: "FT" | "IN";
  height: string;
  heightUnit: "FT" | "IN";
  quantity: string;
  manualRate?: string;
  finishAmount?: string;
  gstRate: number;
  accountId?: string;
  taxRateId?: string;
  inventoryItemId?: string;
}

const makeRow = (): InvoiceRow => ({
  id: Math.random().toString(36).slice(2, 10),
  productId: "",
  productName: "",
  description: "",
  hsnCode: "",
  billingMode: "B",
  pcsNo: "1",
  width: "1",
  widthUnit: "FT",
  height: "1",
  heightUnit: "FT",
  quantity: "1",
  manualRate: "",
  finishAmount: "0.00",
  gstRate: 18,
});

function normalizeDeliveryMode(mode?: string): "PICKUP" | "DOOR" | "COURIER" | "TRANSPORT" {
  if (!mode) return "PICKUP";
  const m = mode.trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (m.includes("DOOR")) return "DOOR";
  if (m.includes("PICK") || m.includes("COUNTER") || m.includes("SELF")) return "PICKUP";
  if (m.includes("COUR")) return "COURIER";
  if (m.includes("TRANS")) return "TRANSPORT";
  return "PICKUP";
}

export function InvoiceFormView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openDrawer } = useCreateDrawer();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Core Data
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [highlightCustomerIndex, setHighlightCustomerIndex] = useState(0);

  // Invoice Details
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // Invoice Items
  const [rows, setRows] = useState<InvoiceRow[]>([makeRow()]);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightProductIndex, setHighlightProductIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeDescRowId, setActiveDescRowId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Logistics
  const [deliveryMode, setDeliveryMode] = useState<"PICKUP" | "DOOR" | "COURIER" | "TRANSPORT">("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

  // Advance Adjustment (AGST_REF vs NEW_REF)
  const [refType, setRefType] = useState<"NEW_REF" | "AGST_REF">("NEW_REF");
  const [availableCredits, setAvailableCredits] = useState<any[]>([]);
  const [selectedCreditId, setSelectedCreditId] = useState("");

  // Extra Options
  const [isDepositRetainer, setIsDepositRetainer] = useState(false);
  const [invoiceType, setInvoiceType] = useState<"deposit" | "retainer">("deposit");
  const [depositPercent, setDepositPercent] = useState("");
  const [forApproval, setForApproval] = useState(false);

  // 100-item Windowing Limits
  const [productLimit, setProductLimit] = useState(100);
  const [customerLimit, setCustomerLimit] = useState(100);

  const tallyNaturalCompare = (aStr: any, bStr: any) => {
    return String(aStr || "")
      .trim()
      .localeCompare(String(bStr || "").trim(), undefined, { numeric: true, sensitivity: "base" });
  };

  // Load Inventory Products, Customers, and Tax Rates
  useEffect(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    async function bootstrap() {
      try {
        const [prodRes, custRes] = await Promise.all([
          fetch("/api/v1/inventory?limit=2500", { headers }),
          fetch("/api/v1/contacts?type=customer&limit=2500", { headers }),
        ]);

        if (prodRes.ok) {
          const pd = await prodRes.json();
          const pList = (pd.data || []).map((row: any) => {
            const meta = row.metadata || {};
            const uom = (row.unit_of_measure || row.tally_uom || "sqft").trim().toLowerCase();
            const cleanUom = uom.replace(/[\s\._-]/g, "");
            const hasMultipleSizes =
              row.has_multiple_sizes !== null && row.has_multiple_sizes !== undefined
                ? Boolean(row.has_multiple_sizes)
                : meta.hasMultipleSizes !== undefined
                ? Boolean(meta.hasMultipleSizes)
                : cleanUom === "sqft" || cleanUom === "sqf" || cleanUom === "ft";
            const defaultMode: "A" | "B" =
              row.tally_billing_mode === "A" || meta.billingMode === "A" ? "A" : "B";

            return {
              ...row,
              id: row.id || row.code || row.sku,
              internal_db_id: row.id,
              name: row.name,
              category: row.category || "General",
              baseRate:
                meta.baseRate != null
                  ? Number(meta.baseRate)
                  : row.sale_price != null
                  ? Number(row.sale_price) / 100
                  : row.base_rate || 0,
              hsn_code: row.hsn_code || row.hsnCode || "",
              gst_rate: row.gst_rate || 18,
              unit_of_measure: uom,
              tally_billing_mode: (row.tally_billing_mode as any) || defaultMode,
              has_multiple_sizes: hasMultipleSizes,
              default_width: row.default_width != null ? Number(row.default_width) : 1,
              default_length: row.default_length != null ? Number(row.default_length) : 1,
            };
          });
          setProducts(pList);
        }

        if (custRes.ok) {
          const cd = await custRes.json();
          setCustomers(cd.data || []);
        }
      } catch (err) {
        console.error("Failed to bootstrap invoice terminal", err);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  // Pre-fill state from Global Orders draft / sessionStorage / localStorage / URL params
  useEffect(() => {
    try {
      const stored =
        sessionStorage.getItem("pending_invoice_draft") || localStorage.getItem("pending_invoice_draft");
      if (stored) {
        sessionStorage.removeItem("pending_invoice_draft");
        localStorage.removeItem("pending_invoice_draft");
        const data = JSON.parse(stored);

        if (data.contactId) setSelectedCustomerId(data.contactId);
        if (data.contactName) setCustomerSearch(data.contactName);
        if (data.reference) setReference(data.reference);
        if (data.deliveryMode) setDeliveryMode(normalizeDeliveryMode(data.deliveryMode));
        if (data.deliveryAddress) setDeliveryAddress(data.deliveryAddress);
        if (data.notes) setNotes(data.notes);

        if (Array.isArray(data.lines) && data.lines.length > 0) {
          const mappedRows: InvoiceRow[] = data.lines.map((l: any) => ({
            id: Math.random().toString(36).slice(2, 10),
            productId: l.inventoryItemId || l.productId || "",
            productName: l.description || "",
            description: l.description || "",
            hsnCode: l.hsnCode || "",
            billingMode: (l.billingMode as "A" | "B") || "B",
            pcsNo: l.pcsNo ? String(l.pcsNo) : "1",
            width: l.width ? String(l.width) : "1",
            widthUnit: "FT",
            height: l.length || l.height ? String(l.length || l.height) : "1",
            heightUnit: "FT",
            quantity: String(l.quantity ?? "1"),
            manualRate: l.unitPrice ? String(l.unitPrice) : "",
            finishAmount: l.finishAmount ? String(l.finishAmount) : "0.00",
            gstRate: l.gstRate || 18,
            accountId: l.accountId || "",
            taxRateId: l.taxRateId || "",
            inventoryItemId: l.inventoryItemId || "",
          }));
          setRows(mappedRows);
        }
        return;
      }

      const urlContactId = searchParams?.get("contactId");
      const urlContactName = searchParams?.get("contactName");
      const urlRef = searchParams?.get("ref") || searchParams?.get("reference") || searchParams?.get("orderId");
      if (urlContactId) setSelectedCustomerId(urlContactId);
      if (urlContactName) setCustomerSearch(urlContactName);
      if (urlRef) setReference(urlRef);
    } catch (e) {
      console.error("Failed to load invoice draft", e);
    }
  }, [searchParams]);

  // Selected Customer lookup
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId && !customerSearch) return null;
    return (
      customers.find(
        (c: any) =>
          (selectedCustomerId && (c.id === selectedCustomerId || c.uid === selectedCustomerId)) ||
          (customerSearch && c.name?.toLowerCase() === customerSearch.toLowerCase())
      ) || null
    );
  }, [customers, selectedCustomerId, customerSearch]);

  // Saved Addresses when customer changes
  useEffect(() => {
    if (!selectedCustomerId && !selectedCustomer) {
      setSavedAddresses([]);
      return;
    }
    const c = selectedCustomer || customers.find((cust) => cust.id === selectedCustomerId);
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
  }, [selectedCustomerId, selectedCustomer, customers]);

  // Load customer credits if AGST_REF
  useEffect(() => {
    const contactId = selectedCustomerId || selectedCustomer?.id;
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
  }, [refType, selectedCustomerId, selectedCustomer]);

  // Auto-focus customer input on mount if empty
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        const el = document.getElementById("invoice-customer-search-input") as HTMLInputElement;
        if (el && !selectedCustomerId && !customerSearch) {
          el.focus();
          try {
            el.select();
          } catch {}
        }
      }, 150);
    }
  }, [loading, selectedCustomerId, customerSearch]);

  // Categories for Stock Items
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      const cat = (p.category || "").trim();
      if (cat) cats.add(cat);
    });
    return Array.from(cats).sort((a, b) => tallyNaturalCompare(a, b));
  }, [products]);

  // Filtered Stock Items
  const matchedProducts = useMemo(() => {
    const catFiltered = selectedCategory
      ? products.filter((p) => (p.category || "").trim().toLowerCase() === selectedCategory.trim().toLowerCase())
      : products;

    const qTrim = searchQuery.trim().toLowerCase();
    if (!qTrim) {
      return [...catFiltered].sort((a, b) => tallyNaturalCompare(a.name, b.name));
    }

    const qTokens = qTrim.split(/\s+/).filter(Boolean);
    return catFiltered
      .filter((p) => {
        const target = `${p.name || ""} ${p.id || ""} ${p.code || ""} ${p.sku || ""} ${p.category || ""}`.toLowerCase();
        return qTokens.every((tok) => target.includes(tok));
      })
      .sort((a, b) => tallyNaturalCompare(a.name, b.name));
  }, [products, searchQuery, selectedCategory]);

  // Sorted Customers
  const sortedCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const list = [...customers];
    if (!term) {
      return list.sort((a, b) => tallyNaturalCompare(a.displayName || a.name, b.displayName || b.name));
    }
    return list
      .filter((c) => {
        const target = `${c.displayName || c.name || ""} ${c.phone || ""} ${c.email || ""} ${c.taxNumber || ""}`.toLowerCase();
        return target.includes(term);
      })
      .sort((a, b) => tallyNaturalCompare(a.displayName || a.name, b.displayName || b.name));
  }, [customers, customerSearch]);

  const visibleProducts = useMemo(() => {
    return matchedProducts.slice(0, Math.max(productLimit, highlightProductIndex + 20));
  }, [matchedProducts, productLimit, highlightProductIndex]);

  const visibleCustomers = useMemo(() => {
    return sortedCustomers.slice(0, Math.max(customerLimit, highlightCustomerIndex + 20));
  }, [sortedCustomers, customerLimit, highlightCustomerIndex]);

  // Row Manipulation
  const addRow = () => {
    setRows((prev) => [...prev, makeRow()]);
  };

  const removeRow = (rowId: string) => {
    if (rows.length === 1) {
      setRows([makeRow()]);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const updateRow = (rowId: string, patch: Partial<InvoiceRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  };

  // Calculations
  const calculatedRows = useMemo(() => {
    return rows.map((row) => {
      const prod = products.find((p) => p.id === row.productId || p.code === row.productId);
      const isSqft = prod ? prod.has_multiple_sizes : true;
      const isModeA = row.billingMode === "A";
      const isModeB = !isModeA;

      const w = Number(row.width || (prod?.default_width ?? 1)) || 0;
      const h = Number(row.height || (prod?.default_length ?? 1)) || 0;
      const wFt = row.widthUnit === "IN" ? w / 12 : w;
      const hFt = row.heightUnit === "IN" ? h / 12 : h;
      const sqft = isSqft ? (wFt > 0 && hFt > 0 ? wFt * hFt : 0) : 0;
      const pcs = Math.max(1, Number(row.pcsNo || "1"));
      const totalBilledSqft = sqft * pcs;

      const baseRate =
        row.manualRate !== undefined && row.manualRate !== ""
          ? Number(row.manualRate) || 0
          : prod?.baseRate || 0;
      const finish = Number(row.finishAmount || "0") || 0;

      const qtyNum =
        Number(row.quantity !== undefined && row.quantity !== "" ? row.quantity : isModeB ? totalBilledSqft : 1) || 1;

      let lineAmount = 0;
      if (!isSqft) {
        lineAmount = qtyNum * baseRate + finish;
      } else if (isModeA) {
        lineAmount = qtyNum * (sqft * baseRate) + finish;
      } else {
        lineAmount = totalBilledSqft * baseRate + finish * pcs;
      }

      const gst = prod?.gst_rate || 18;
      const taxAmount = (lineAmount * gst) / 100;

      return {
        ...row,
        sqft,
        totalBilledSqft,
        baseRate,
        lineAmount: Number(lineAmount.toFixed(2)),
        taxAmount: Number(taxAmount.toFixed(2)),
        totalWithTax: Number((lineAmount + taxAmount).toFixed(2)),
        gstRate: gst,
      };
    });
  }, [rows, products]);

  const summary = useMemo(() => {
    const subtotal = calculatedRows.reduce((sum, r) => sum + r.lineAmount, 0);
    const taxTotal = calculatedRows.reduce((sum, r) => sum + r.taxAmount, 0);
    const grandTotal = subtotal + taxTotal;
    const cgst = taxTotal / 2;
    const sgst = taxTotal / 2;

    return {
      subtotal,
      taxTotal,
      cgst,
      sgst,
      grandTotal,
    };
  }, [calculatedRows]);

  // Keyboard shortcut: Ctrl + Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCustomerId, selectedCustomer, refType, selectedCreditId, calculatedRows, issueDate, dueDate, reference, notes, deliveryMode, deliveryAddress, forApproval, isDepositRetainer, depositPercent]);

  const handleSubmit = async () => {
    const contactId = selectedCustomerId || selectedCustomer?.id || selectedCustomer?.uid;
    if (!contactId) {
      toast.error("Please select a customer");
      return;
    }

    const validRows = calculatedRows.filter((r) => r.productId || r.productName);
    if (validRows.length === 0) {
      toast.error("Please add at least one item to invoice");
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
      isDepositRetainer && depositPercent.trim() !== "" && !Number.isNaN(pct) ? Math.round(pct * 100) : null;

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
          lines: validRows.map((l) => ({
            description: l.productName || l.description || "Custom Item",
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: l.baseRate || parseFloat(l.manualRate || "0") || 0,
            billingMode: l.billingMode || null,
            pcsNo: parseFloat(l.pcsNo || "1") || null,
            accountId: l.accountId || null,
            taxRateId: l.taxRateId || null,
            inventoryItemId: l.productId || null,
            width: parseFloat(l.width || "0") || null,
            length: parseFloat(l.height || "0") || null,
            sqFt: l.sqft || null,
            finishAmount: parseFloat(l.finishAmount || "0") || null,
            deliveryMode: deliveryMode || null,
            deliveryAmount: null,
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
          : "Invoice created successfully ✓"
      );
      router.push(`/accounting/sales/${inv.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["ACDEMA", "ADMIN", "SUPER_ADMIN", "ACCOUNTANT", "MANAGER"]}>
      <div className="font-sans text-slate-800 p-3 md:p-4 pt-2 md:pt-3 relative z-10 min-h-[calc(100vh-4rem)] rounded-none">
        <div className="w-full">
          {/* Ambient Soft Blue Mesh Gradient Background */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none bg-[#e2ecf8]">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-15 mix-blend-overlay" />
            <div className="absolute inset-0 bg-[radial-gradient(#bfdbfe_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
            <div className="absolute -top-[15%] -right-[10%] w-[55vw] h-[55vw] rounded-full bg-sky-200/50 blur-[130px] pointer-events-none" />
            <div className="absolute -bottom-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-blue-200/40 blur-[130px] pointer-events-none" />
            <div className="absolute top-[35%] left-[25%] w-[45vw] h-[45vw] rounded-full bg-sky-100/60 blur-[120px] pointer-events-none" />
          </div>

          <div className="flex flex-col gap-4 pb-20 relative z-10">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between bg-white/60 backdrop-blur-2xl p-3.5 rounded-[1.75rem] border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/accounting/sales")}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white/80 hover:bg-white rounded-xl border border-slate-200 transition-all shadow-xs"
                >
                  <ArrowLeft size={14} /> Back to Invoices
                </button>
                <div className="h-4 w-px bg-slate-300" />
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h1 className="text-sm font-black uppercase tracking-wider text-slate-900">Sales Invoice Terminal</h1>
                    <p className="text-[10px] font-medium text-slate-500">Tally-Speed Full Screen Billing</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/accounting/sales")}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white/80 hover:bg-white rounded-xl border border-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:scale-[1.02] active:scale-95 rounded-xl shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Create Invoice (Ctrl+Enter)
                </button>
              </div>
            </div>

            {/* Top 3-Card Row: Image Card, Date & Number Card, Customer Card */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-[200px_auto_1fr] items-stretch">
              {/* Image Banner Card */}
              <div className="relative z-10 rounded-[2rem] bg-white/50 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col justify-center min-h-[120px]">
                <div className="w-full h-full rounded-[1.5rem] overflow-hidden relative bg-white">
                  <img
                    src="https://images.unsplash.com/photo-1626282874430-c11ae32d2898?auto=format&fit=crop&w=1200"
                    className="absolute inset-0 w-full h-full object-cover"
                    alt="Invoice banner"
                  />
                </div>
              </div>

              {/* Invoice # & Date Card */}
              <div className="relative z-20 rounded-[2rem] bg-white/50 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col justify-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 leading-tight">
                      Reference / PO #
                    </span>
                    <input
                      id="invoice-reference-input"
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="e.g. PO-8842"
                      className="h-10 w-32 bg-slate-50 text-slate-800 font-mono font-black text-xs px-3 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:bg-white outline-none"
                    />
                  </div>

                  <div className="h-9 w-[1px] bg-slate-200 self-end mb-0.5" />

                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 leading-tight">
                      Issue Date (F2)
                    </span>
                    <input
                      id="invoice-date-input"
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="h-10 bg-slate-50 hover:bg-slate-100 focus:bg-white text-slate-800 font-bold text-xs px-3 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Customer Card */}
              <div className="relative z-50 rounded-[2rem] bg-white/50 p-4 pb-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer *</h3>
                  <button
                    type="button"
                    onClick={() => openDrawer("contact")}
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    + New Customer
                  </button>
                </div>

                <div className="relative">
                  <div
                    className={`flex h-10 w-full items-center rounded-xl px-3 transition-all duration-150 ${
                      customerDropdownOpen
                        ? "border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-md"
                        : "border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white"
                    }`}
                  >
                    <Search
                      size={16}
                      className={`mr-2 transition-colors shrink-0 ${
                        customerDropdownOpen ? "text-blue-600" : "text-slate-400"
                      }`}
                    />
                    <input
                      id="invoice-customer-search-input"
                      autoFocus
                      value={
                        customerSearch !== ""
                          ? customerSearch
                          : selectedCustomer?.displayName || selectedCustomer?.name || ""
                      }
                      placeholder="Search customer by name, phone, GSTIN..."
                      data-dropdown-open={customerDropdownOpen ? "true" : "false"}
                      onChange={(e) => {
                        setCustomerDropdownOpen(true);
                        setCustomerSearch(e.target.value);
                        setHighlightCustomerIndex(0);
                      }}
                      onFocus={(e) => {
                        setCustomerDropdownOpen(true);
                        if (selectedCustomer) {
                          setCustomerSearch(selectedCustomer.displayName || selectedCustomer.name || "");
                          e.target.select();
                        } else {
                          setCustomerSearch("");
                        }
                        setHighlightCustomerIndex(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (!customerDropdownOpen) {
                            setCustomerDropdownOpen(true);
                            setHighlightCustomerIndex(0);
                            return;
                          }
                          setHighlightCustomerIndex((prev) => Math.min(prev + 1, visibleCustomers.length - 1));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setHighlightCustomerIndex((prev) => Math.max(prev - 1, 0));
                        } else if (e.key === "Enter") {
                          if (customerDropdownOpen && visibleCustomers.length > 0) {
                            e.preventDefault();
                            const cust = visibleCustomers[highlightCustomerIndex] || visibleCustomers[0];
                            if (cust) {
                              setSelectedCustomerId(cust.uid || cust.id);
                              setCustomerDropdownOpen(false);
                              setCustomerSearch("");
                              setHighlightCustomerIndex(0);
                              setTimeout(() => {
                                const row0Input = document.getElementById("row-0-product-input");
                                if (row0Input) row0Input.focus();
                              }, 60);
                            }
                          } else if (selectedCustomer || selectedCustomerId) {
                            e.preventDefault();
                            setCustomerDropdownOpen(false);
                            const row0Input = document.getElementById("row-0-product-input");
                            if (row0Input) row0Input.focus();
                          }
                        } else if (e.key === "Escape") {
                          setCustomerDropdownOpen(false);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setCustomerDropdownOpen(false);
                          setCustomerSearch("");
                        }, 200);
                      }}
                      className="h-full w-full border-0 focus:ring-0 p-0 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder-slate-400"
                    />
                    <ChevronDown
                      size={16}
                      className={`ml-2 transition-colors shrink-0 ${
                        customerDropdownOpen ? "text-blue-600" : "text-slate-400"
                      }`}
                    />
                  </div>

                  {/* Customer Dropdown */}
                  {customerDropdownOpen && (
                    <div
                      onMouseDown={(e) => e.preventDefault()}
                      className="absolute left-0 right-0 top-12 z-[9999] max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl space-y-1"
                    >
                      {visibleCustomers.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 font-medium">
                          No matching customers found.
                        </div>
                      ) : (
                        visibleCustomers.map((c: any, idx: number) => {
                          const isHighlighted = idx === highlightCustomerIndex;
                          const isSelected = (c.uid || c.id) === selectedCustomerId;
                          return (
                            <div
                              key={c.id || c.uid || idx}
                              id={`customer-item-${idx}`}
                              onClick={() => {
                                setSelectedCustomerId(c.uid || c.id);
                                setCustomerDropdownOpen(false);
                                setCustomerSearch("");
                                setTimeout(() => {
                                  const row0Input = document.getElementById("row-0-product-input");
                                  if (row0Input) row0Input.focus();
                                }, 60);
                              }}
                              className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-colors ${
                                isHighlighted || isSelected
                                  ? "bg-blue-600 text-white font-bold"
                                  : "hover:bg-slate-100 text-slate-800 font-medium"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="truncate">{c.displayName || c.name}</p>
                                <p className={`text-[10px] ${isHighlighted || isSelected ? "text-blue-100" : "text-slate-400"}`}>
                                  {c.phone || "No phone"} {c.taxNumber ? `• GST: ${c.taxNumber}` : ""}
                                </p>
                              </div>
                              {c.owesYou ? (
                                <span className={`text-[11px] font-mono font-bold shrink-0 ml-2 ${isHighlighted || isSelected ? "text-white" : "text-amber-600"}`}>
                                  Due: ₹{(c.owesYou / 100).toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {selectedCustomer && (
                    <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs font-medium text-slate-600 border border-slate-200 flex items-center justify-between">
                      <span>{selectedCustomer.phone || "No phone"} • {selectedCustomer.businessName || selectedCustomer.billing_city || "Customer"}</span>
                      {selectedCustomer.taxNumber && (
                        <span className="font-mono text-[10px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border">
                          GST: {selectedCustomer.taxNumber}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ORDER ITEMS TABLE CARD */}
            <div className="relative z-20 rounded-[1.75rem] bg-white/50 p-3.5 pb-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</h3>
                  <span className="text-[11px] text-slate-400 font-medium">({calculatedRows.length} lines)</span>
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={addRow}
                  className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Plus size={12} /> Add Row
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <th className="py-1.5 px-1.5 w-8 text-center">#</th>
                      <th className="py-1.5 px-2 min-w-[240px] text-left">Name of Item</th>
                      <th className="py-1.5 px-1 w-[88px] text-center">HSN Code</th>
                      <th className="py-1.5 px-1 w-[55px] text-center">GST %</th>
                      <th className="py-1.5 px-1 w-[45px] text-center">T</th>
                      <th className="py-1.5 px-1 w-[95px] text-center">Width</th>
                      <th className="py-1.5 px-1 w-[95px] text-center">Length</th>
                      <th className="py-1.5 px-1 w-[75px] text-center">Sq. Ft.</th>
                      <th className="py-1.5 px-1 w-[70px] text-center">Pcs/No</th>
                      <th className="py-1.5 px-1 w-[105px] text-center">Quantity</th>
                      <th className="py-1.5 px-1 w-[90px] text-center">Rate/SqFt</th>
                      <th className="py-1.5 px-1 w-[105px] text-center">Rate per</th>
                      <th className="py-1.5 px-1 w-[90px] text-center">Finish</th>
                      <th className="py-1.5 px-2 w-[105px] text-right">Amount</th>
                      <th className="py-1.5 px-1 w-9 text-center">×</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {calculatedRows.map((row, index) => {
                      const prod = products.find((p) => p.id === row.productId || p.code === row.productId);
                      const isSqft = prod ? prod.has_multiple_sizes : true;
                      const isModeA = row.billingMode === "A";
                      const isOpen = openRowId === row.id;

                      return (
                        <tr key={row.id} className="group transition-colors hover:bg-slate-50/50 align-top">
                          <td className="py-1 px-1.5 text-center tabular-nums align-top">
                            <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-400">
                              {index + 1}
                            </div>
                          </td>

                          {/* Product Selection */}
                          <td className="py-1 px-2 align-top">
                            <div className="relative min-w-[240px]">
                              <div
                                className={`flex h-10 w-full items-center rounded-lg px-3 transition-all duration-150 ${
                                  isOpen
                                    ? "border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-sm"
                                    : "border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:bg-white"
                                }`}
                              >
                                <input
                                  id={`row-${index}-product-input`}
                                  value={isOpen ? searchQuery : row.productName || prod?.name || ""}
                                  placeholder="Select item..."
                                  data-dropdown-open={isOpen ? "true" : "false"}
                                  onChange={(e) => {
                                    setOpenRowId(row.id);
                                    setSearchQuery(e.target.value);
                                    setHighlightProductIndex(0);
                                  }}
                                  onFocus={(e) => {
                                    setOpenRowId(row.id);
                                    setSearchQuery(row.productName || prod?.name || "");
                                    const currIdx = visibleProducts.findIndex((p) => p.id === row.productId);
                                    setHighlightProductIndex(currIdx >= 0 ? currIdx : 0);
                                    setTimeout(() => {
                                      try {
                                        e.target.select();
                                      } catch {}
                                    }, 10);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "ArrowDown") {
                                      e.preventDefault();
                                      if (!isOpen) {
                                        setOpenRowId(row.id);
                                        return;
                                      }
                                      setHighlightProductIndex((prev) =>
                                        Math.min(prev + 1, visibleProducts.length - 1)
                                      );
                                    } else if (e.key === "ArrowUp") {
                                      e.preventDefault();
                                      setHighlightProductIndex((prev) => Math.max(prev - 1, 0));
                                    } else if (e.key === "Enter") {
                                      e.preventDefault();
                                      if (isOpen && visibleProducts.length > 0) {
                                        const p = visibleProducts[highlightProductIndex] || visibleProducts[0];
                                        if (p) {
                                          updateRow(row.id, {
                                            productId: p.id,
                                            productName: p.name,
                                            description: p.name,
                                            hsnCode: p.hsn_code || "",
                                            billingMode: p.tally_billing_mode || "B",
                                            manualRate: p.baseRate ? String(p.baseRate) : "",
                                            gstRate: p.gst_rate || 18,
                                          });
                                          setOpenRowId(null);
                                          setSearchQuery("");
                                          setTimeout(() => {
                                            const wInput = document.getElementById(`row-${row.id}-width`);
                                            if (wInput) wInput.focus();
                                          }, 60);
                                        }
                                      } else {
                                        setOpenRowId(null);
                                        const wInput = document.getElementById(`row-${row.id}-width`);
                                        if (wInput) wInput.focus();
                                      }
                                    } else if (e.key === "Escape") {
                                      setOpenRowId(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (openRowId === row.id) {
                                        setOpenRowId(null);
                                        setSearchQuery("");
                                      }
                                    }, 200);
                                  }}
                                  className="h-full w-full border-0 focus:ring-0 p-0 bg-transparent text-xs font-bold text-slate-800 outline-none placeholder-slate-400"
                                />
                                <ChevronDown size={14} className="text-slate-400 shrink-0 ml-1" />
                              </div>

                              {/* Stock Items Dropdown */}
                              {isOpen && (
                                <div
                                  onMouseDown={(e) => e.preventDefault()}
                                  className="absolute left-0 top-12 z-[9999] w-[340px] max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl space-y-1"
                                >
                                  {/* Category Filter Chips */}
                                  <div className="flex gap-1 overflow-x-auto pb-1.5 mb-1.5 border-b border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedCategory(null)}
                                      className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${
                                        selectedCategory === null
                                          ? "bg-slate-900 text-white"
                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                      }`}
                                    >
                                      All
                                    </button>
                                    {availableCategories.map((cat) => (
                                      <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${
                                          selectedCategory === cat
                                            ? "bg-blue-600 text-white"
                                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        }`}
                                      >
                                        {cat}
                                      </button>
                                    ))}
                                  </div>

                                  {visibleProducts.map((p, idx) => {
                                    const isHighlighted = idx === highlightProductIndex;
                                    const isSelected = p.id === row.productId;
                                    return (
                                      <div
                                        key={p.id || idx}
                                        onClick={() => {
                                          updateRow(row.id, {
                                            productId: p.id,
                                            productName: p.name,
                                            description: p.name,
                                            hsnCode: p.hsn_code || "",
                                            billingMode: p.tally_billing_mode || "B",
                                            manualRate: p.baseRate ? String(p.baseRate) : "",
                                            gstRate: p.gst_rate || 18,
                                          });
                                          setOpenRowId(null);
                                          setSearchQuery("");
                                          setTimeout(() => {
                                            const wInput = document.getElementById(`row-${row.id}-width`);
                                            if (wInput) wInput.focus();
                                          }, 60);
                                        }}
                                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                                          isHighlighted || isSelected
                                            ? "bg-blue-600 text-white font-bold"
                                            : "hover:bg-slate-100 text-slate-800 font-medium"
                                        }`}
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate">{p.name}</p>
                                          <p
                                            className={`text-[10px] ${
                                              isHighlighted || isSelected ? "text-blue-100" : "text-slate-400"
                                            }`}
                                          >
                                            {p.category} {p.hsn_code ? `• HSN: ${p.hsn_code}` : ""}
                                          </p>
                                        </div>
                                        <span className="font-mono text-xs shrink-0 ml-2">
                                          ₹{Number(p.baseRate || 0).toFixed(2)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* HSN Code */}
                          <td className="py-1 px-1 align-top text-center">
                            <input
                              type="text"
                              value={row.hsnCode}
                              onChange={(e) => updateRow(row.id, { hsnCode: e.target.value })}
                              placeholder="HSN"
                              className="h-10 w-full text-center bg-slate-50 border-2 border-slate-200 rounded-lg text-xs font-mono font-medium focus:bg-white focus:border-blue-600 outline-none"
                            />
                          </td>

                          {/* GST % */}
                          <td className="py-1 px-1 align-top text-center">
                            <div className="h-10 flex items-center justify-center font-bold text-xs text-slate-600">
                              {row.gstRate}%
                            </div>
                          </td>

                          {/* Billing Mode Badge (A / B) */}
                          <td className="py-1 px-1 align-top text-center">
                            <button
                              type="button"
                              onClick={() =>
                                updateRow(row.id, { billingMode: row.billingMode === "A" ? "B" : "A" })
                              }
                              title="Toggle Tally Billing Mode A (Direct) / B (SqFt x Pcs)"
                              className={`h-10 w-full flex items-center justify-center font-mono font-black text-xs rounded-lg transition-colors ${
                                row.billingMode === "A"
                                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              }`}
                            >
                              {row.billingMode || "B"}
                            </button>
                          </td>

                          {/* Width */}
                          <td className="py-1 px-1 align-top text-center">
                            <input
                              id={`row-${row.id}-width`}
                              type="number"
                              step="0.01"
                              value={row.width}
                              onChange={(e) => updateRow(row.id, { width: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`row-${row.id}-height`)?.focus();
                                }
                              }}
                              className="h-10 w-full text-center bg-slate-50 border-2 border-slate-200 rounded-lg text-xs font-bold focus:bg-white focus:border-blue-600 outline-none"
                            />
                          </td>

                          {/* Length / Height */}
                          <td className="py-1 px-1 align-top text-center">
                            <input
                              id={`row-${row.id}-height`}
                              type="number"
                              step="0.01"
                              value={row.height}
                              onChange={(e) => updateRow(row.id, { height: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`row-${row.id}-pcs`)?.focus();
                                }
                              }}
                              className="h-10 w-full text-center bg-slate-50 border-2 border-slate-200 rounded-lg text-xs font-bold focus:bg-white focus:border-blue-600 outline-none"
                            />
                          </td>

                          {/* Sq. Ft. */}
                          <td className="py-1 px-1 align-top text-center">
                            <div className="h-10 flex items-center justify-center font-mono text-xs font-bold text-slate-700">
                              {row.sqft.toFixed(2)}
                            </div>
                          </td>

                          {/* Pcs / No */}
                          <td className="py-1 px-1 align-top text-center">
                            <input
                              id={`row-${row.id}-pcs`}
                              type="number"
                              min="1"
                              value={row.pcsNo}
                              onChange={(e) => updateRow(row.id, { pcsNo: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`row-${row.id}-rate`)?.focus();
                                }
                              }}
                              className="h-10 w-full text-center bg-slate-50 border-2 border-slate-200 rounded-lg text-xs font-bold focus:bg-white focus:border-blue-600 outline-none"
                            />
                          </td>

                          {/* Total Quantity */}
                          <td className="py-1 px-1 align-top text-center">
                            <div className="h-10 flex items-center justify-center font-mono text-xs font-bold text-slate-700">
                              {row.billingMode === "A" ? row.quantity : row.totalBilledSqft.toFixed(2)}
                            </div>
                          </td>

                          {/* Rate / SqFt */}
                          <td className="py-1 px-1 align-top text-center">
                            <input
                              id={`row-${row.id}-rate`}
                              type="number"
                              step="0.01"
                              value={row.manualRate}
                              onChange={(e) => updateRow(row.id, { manualRate: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`row-${row.id}-finish`)?.focus();
                                }
                              }}
                              placeholder={prod?.baseRate ? String(prod.baseRate) : "0.00"}
                              className="h-10 w-full text-center bg-slate-50 border-2 border-slate-200 rounded-lg text-xs font-mono font-bold focus:bg-white focus:border-blue-600 outline-none text-emerald-700"
                            />
                          </td>

                          {/* Rate per */}
                          <td className="py-1 px-1 align-top text-center">
                            <div className="h-10 flex items-center justify-center font-mono text-xs text-slate-500 font-bold">
                              ₹{row.baseRate.toFixed(2)}
                            </div>
                          </td>

                          {/* Finish Amount */}
                          <td className="py-1 px-1 align-top text-center">
                            <input
                              id={`row-${row.id}-finish`}
                              type="number"
                              step="0.01"
                              value={row.finishAmount}
                              onChange={(e) => updateRow(row.id, { finishAmount: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (index === calculatedRows.length - 1) {
                                    addRow();
                                  } else {
                                    const nextInput = document.getElementById(`row-${index + 1}-product-input`);
                                    if (nextInput) nextInput.focus();
                                  }
                                }
                              }}
                              className="h-10 w-full text-center bg-slate-50 border-2 border-slate-200 rounded-lg text-xs font-mono font-medium focus:bg-white focus:border-blue-600 outline-none"
                            />
                          </td>

                          {/* Line Total Amount */}
                          <td className="py-1 px-2 align-top text-right">
                            <div className="h-10 flex items-center justify-end font-mono font-black text-xs text-slate-900">
                              ₹{row.lineAmount.toFixed(2)}
                            </div>
                          </td>

                          {/* Delete Button */}
                          <td className="py-1 px-1 align-top text-center">
                            <button
                              type="button"
                              onClick={() => removeRow(row.id)}
                              className="h-10 w-full flex items-center justify-center text-slate-300 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Grid: Logistics, Reference/Settlement, Summary Panel */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-12 items-start">
              {/* Logistics & Delivery Card (6 cols) */}
              <div className="lg:col-span-4 rounded-[2rem] bg-white/50 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck size={16} className="text-blue-600" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Logistics & Delivery</h3>
                  </div>
                  {savedAddresses.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setDeliveryAddress(e.target.value);
                      }}
                      className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-1 outline-none cursor-pointer"
                    >
                      <option value="">Saved addresses...</option>
                      {savedAddresses.map((a, idx) => (
                        <option key={idx} value={a.address}>
                          {a.label}: {a.address}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Mode Tabs */}
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/50">
                  {(["PICKUP", "DOOR", "COURIER", "TRANSPORT"] as const).map((mode) => {
                    const isActive = deliveryMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDeliveryMode(mode)}
                        className={`py-2 text-[10px] font-black tracking-wider uppercase rounded-xl transition-all ${
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

                {deliveryMode !== "PICKUP" ? (
                  <textarea
                    rows={2}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Delivery destination address..."
                    className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium p-2.5 outline-none focus:border-blue-600"
                  />
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 font-medium">
                    Self Pickup at Shop Counter
                  </div>
                )}
              </div>

              {/* Reference & Advance Terms (4 cols) */}
              <div className="lg:col-span-4 rounded-[2rem] bg-white/50 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 space-y-4">
                <div className="flex items-center gap-2">
                  <Receipt size={16} className="text-blue-600" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Reference & Settlement</h3>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRefType("NEW_REF");
                      setSelectedCreditId("");
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                      refType === "NEW_REF"
                        ? "bg-slate-900 text-white shadow-md ring-2 ring-blue-500/50"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    New Ref (Normal)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefType("AGST_REF")}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                      refType === "AGST_REF"
                        ? "bg-amber-600 text-white shadow-md ring-2 ring-amber-500/50"
                        : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    Agst Ref (Advance)
                  </button>
                </div>

                {refType === "AGST_REF" && (
                  <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                    <label className="text-[10px] font-bold text-amber-900 uppercase">Select Advance Receipt *</label>
                    {availableCredits.length === 0 ? (
                      <p className="text-xs text-amber-800 font-medium">No open advances found for this customer.</p>
                    ) : (
                      <select
                        value={selectedCreditId}
                        onChange={(e) => setSelectedCreditId(e.target.value)}
                        className="w-full bg-white text-xs font-bold rounded-lg border border-amber-300 p-2 outline-none"
                      >
                        {availableCredits.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.referenceNumber || c.notes || "Advance"} · Available: ₹{(c.amountRemaining / 100).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes to Customer / Remarks..."
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium p-2.5 outline-none focus:border-blue-600"
                />
              </div>

              {/* Calculation Summary Card (4 cols) */}
              <div className="lg:col-span-4 rounded-[2rem] bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-2xl border border-white/80 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Invoice Summary</h3>

                <div className="space-y-2 text-xs font-semibold text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono text-slate-900">₹{summary.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>CGST (9%)</span>
                    <span className="font-mono">₹{summary.cgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>SGST (9%)</span>
                    <span className="font-mono">₹{summary.sgst.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-slate-200 my-1" />
                  <div className="flex justify-between text-sm font-black text-slate-900 pt-1">
                    <span>Grand Total</span>
                    <span className="font-mono text-base text-blue-600">₹{summary.grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:scale-[1.01] active:scale-95 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Create Invoice (Ctrl+Enter)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
