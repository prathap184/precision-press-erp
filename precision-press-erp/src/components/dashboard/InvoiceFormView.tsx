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
  Upload,
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
  widthUnit: "FT" | "IN" | "MTR";
  height: string;
  heightUnit: "FT" | "IN" | "MTR";
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

function normalizeDeliveryMode(mode?: string): "selfPickup" | "door" | "courier" | "transport" {
  if (!mode) return "selfPickup";
  const m = mode.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (m.includes("door")) return "door";
  if (m.includes("pick") || m.includes("counter") || m.includes("self")) return "selfPickup";
  if (m.includes("cour")) return "courier";
  if (m.includes("trans")) return "transport";
  return "selfPickup";
}

function isoToDisplayDate(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

function parseTallyDate(input: string, fallbackIso: string = new Date().toISOString().split('T')[0]): string {
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
        return `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } else if (digits.length === 4) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } else if (digits.length === 6) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      let year = parseInt(digits.slice(4, 6), 10);
      year = year < 50 ? 2000 + year : 1900 + year;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } else if (digits.length === 8) {
      const day = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10);
      const year = parseInt(digits.slice(4, 8), 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  } else if (parts.length === 2) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  } else if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return fallbackIso;
}

function HighlightMatch({ text, query, isHighlighted }: { text: string; query: string; isHighlighted?: boolean }) {
  if (!text) return null;
  const q = (query || '').trim();
  if (!q) return <>{text}</>;

  const cleanQ = q.replace(/^ct[:\s\-\/]?\s*/i, '').trim();
  if (!cleanQ) return <>{text}</>;

  const tokens = cleanQ.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;

  const escapedTokens = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = tokens.some((t) => t.toLowerCase() === part.toLowerCase());
        if (isMatch) {
          return (
            <mark
              key={i}
              className={
                isHighlighted
                  ? 'bg-black text-amber-300 font-extrabold px-0.5 rounded-xs underline decoration-amber-400'
                  : 'bg-amber-300/90 text-amber-950 font-extrabold px-0.5 rounded-xs shadow-2xs'
              }
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
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
  const [dateDisplayInput, setDateDisplayInput] = useState(() => isoToDisplayDate(new Date().toISOString().split("T")[0]));

  useEffect(() => {
    if (issueDate) {
      setDateDisplayInput(isoToDisplayDate(issueDate));
    }
  }, [issueDate]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Invoice Items
  const [rows, setRows] = useState<InvoiceRow[]>([makeRow()]);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [openUnitPickerId, setOpenUnitPickerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightProductIndex, setHighlightProductIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeDescRowId, setActiveDescRowId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [pendingFocusNewRow, setPendingFocusNewRow] = useState(false);

  // Logistics
  const [deliveryType, setDeliveryType] = useState<"selfPickup" | "door" | "courier" | "transport">("selfPickup");
  const [logisticsDropdownOpen, setLogisticsDropdownOpen] = useState(false);
  const [highlightLogisticsIndex, setHighlightLogisticsIndex] = useState(0);
  const [shippingAddress, setShippingAddress] = useState("");
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

  const LOGISTICS_OPTIONS = useMemo(
    () => [
      { id: "selfPickup", label: "PICKUP", sublabel: "Self Collection at Store", key: "p" },
      { id: "door", label: "DOOR", sublabel: "Direct Door Delivery", key: "d" },
      { id: "courier", label: "COURIER", sublabel: "Dispatch via Courier Service", key: "c" },
      { id: "transport", label: "TRANSPORT", sublabel: "Freight / Transport Service", key: "t" },
    ],
    []
  );

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
          fetch("/api/v1/inventory?status=active&limit=100&sortBy=name&sortOrder=asc", { headers }),
          fetch("/api/v1/contacts?type=customer&limit=100&sortBy=name&sortOrder=asc", { headers }),
        ]);

        if (prodRes.ok) {
          const pd = await prodRes.json();
          const pList = (pd.data || []).map((row: any) => {
            const meta = row.metadata || {};
            const hasSingleDefaultSize = Boolean(
              row.has_single_default_size ??
              meta.has_single_default_size ??
              (Number(row.default_width || row.defaultWidth) > 0 && Number(row.default_length || row.defaultLength) > 0)
            );
            const hasMultipleSizes = Boolean(
              row.has_multiple_sizes !== null && row.has_multiple_sizes !== undefined
                ? Boolean(row.has_multiple_sizes)
                : row.hasMultipleSizes !== undefined
                ? Boolean(row.hasMultipleSizes)
                : meta.hasMultipleSizes !== undefined
                ? Boolean(meta.hasMultipleSizes)
                : false
            );
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
        if (data.deliveryMode) setDeliveryType(normalizeDeliveryMode(data.deliveryMode));
        if (data.deliveryAddress) setShippingAddress(data.deliveryAddress);
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
      if (list.length > 0 && !shippingAddress) {
        setShippingAddress(list[0].address);
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

  // Categories for Stock Items
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      const cat = (p.category || "").trim();
      if (cat) cats.add(cat);
    });
    return Array.from(cats).sort((a, b) => tallyNaturalCompare(a, b));
  }, [products]);

  // High performance search matching
  const matchProducts = (query: string, customCat: string | null = selectedCategory) => {
    const catFiltered = customCat
      ? products.filter((p: any) => (p.category || "").trim().toLowerCase() === customCat.trim().toLowerCase())
      : products;

    const qTrim = query.trim().toLowerCase();
    if (!qTrim) {
      return [...catFiltered].sort((a: any, b: any) => tallyNaturalCompare(a.name, b.name));
    }

    const isCtSearch = /^ct([:\s\-\/]|$)/i.test(qTrim);
    if (isCtSearch) {
      const ctQuery = qTrim.replace(/^ct[:\s\-\/]?\s*/i, "").trim();
      if (!ctQuery) {
        return [...catFiltered].sort((a: any, b: any) => tallyNaturalCompare(a.name, b.name));
      }
      const ctTokens = ctQuery.split(/\s+/).filter(Boolean);
      const catSearchTerm = ctTokens[0];
      const itemTokens = ctTokens.slice(1);

      return catFiltered
        .filter((p: any) => {
          const cat = (p.category || "").toLowerCase();
          const fullTarget = `${p.name || ""} ${p.id || ""} ${p.code || ""} ${p.sku || ""}`.toLowerCase();
          if (cat.includes(ctQuery)) return true;
          if (cat.includes(catSearchTerm)) {
            return itemTokens.length === 0 || itemTokens.every((tok) => fullTarget.includes(tok));
          }
          return false;
        })
        .sort((a: any, b: any) => {
          const aCat = (a.category || "").toLowerCase();
          const bCat = (b.category || "").toLowerCase();
          const aExact = aCat === ctQuery || aCat === catSearchTerm;
          const bExact = bCat === ctQuery || bCat === catSearchTerm;
          if (aExact && !bExact) return -1;
          if (bExact && !aExact) return 1;
          return tallyNaturalCompare(a.name, b.name);
        });
    }

    const qTokens = qTrim.split(/\s+/).filter(Boolean);
    return catFiltered
      .filter((p: any) => {
        const aliases = Array.isArray(p.metadata?.aliases) ? p.metadata.aliases.join(" ") : "";
        const target = `${p.name || ""} ${p.id || ""} ${p.code || ""} ${p.sku || ""} ${p.category || ""} ${aliases}`.toLowerCase();
        return qTokens.every((tok) => target.includes(tok));
      })
      .sort((a: any, b: any) => {
        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        const aAliases: string[] = Array.isArray(a.metadata?.aliases) ? a.metadata.aliases.map((al: string) => al.toLowerCase()) : [];
        const bAliases: string[] = Array.isArray(b.metadata?.aliases) ? b.metadata.aliases.map((al: string) => al.toLowerCase()) : [];

        // 0. Exact alias match gets top priority (e.g. typing "A2")
        const aAliasExact = aAliases.includes(qTrim);
        const bAliasExact = bAliases.includes(qTrim);
        if (aAliasExact && !bAliasExact) return -1;
        if (bAliasExact && !aAliasExact) return 1;

        if (aName === qTrim && bName !== qTrim) return -1;
        if (bName === qTrim && aName !== qTrim) return 1;
        const aStarts = aName.startsWith(qTrim);
        const bStarts = bName.startsWith(qTrim);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;
        return tallyNaturalCompare(a.name, b.name);
      });
  };

  const matchedProducts = useMemo(() => {
    return matchProducts(searchQuery, selectedCategory);
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
        const target = `${c.displayName || c.name || ""} ${c.phone || ""} ${c.email || ""} ${c.taxNumber || ""} ${c.gstin || ""}`.toLowerCase();
        return target.includes(term);
      })
      .sort((a, b) => tallyNaturalCompare(a.displayName || a.name, b.displayName || b.name));
  }, [customers, customerSearch]);

  // Ensure selected contact by ID is loaded if not in initial list
  useEffect(() => {
    if (!selectedCustomerId) return;
    const exists = customers.some((c: any) => c.id === selectedCustomerId || c.uid === selectedCustomerId);
    if (exists) return;

    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    fetch(`/api/v1/contacts/${selectedCustomerId}`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data && (data.id || data.data?.id)) {
          const contactObj = data.id ? data : data.data;
          setCustomers((prev) => {
            if (prev.some((c: any) => c.id === contactObj.id)) return prev;
            return [contactObj, ...prev];
          });
        }
      })
      .catch(() => {});
  }, [selectedCustomerId, customers]);

  // Live server customer search when typing in customerSearch
  useEffect(() => {
    const term = customerSearch.trim();
    if (!term) return;

    if (
      selectedCustomer &&
      (term.toLowerCase() === (selectedCustomer.name || "").toLowerCase() ||
        term.toLowerCase() === (selectedCustomer.displayName || "").toLowerCase())
    ) {
      return;
    }

    let cancelled = false;
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/contacts?type=customer&limit=50&search=${encodeURIComponent(term)}&sortBy=name&sortOrder=asc`,
          { headers }
        );
        if (res.ok) {
          const cd = await res.json();
          if (cd.data && Array.isArray(cd.data) && !cancelled) {
            setCustomers((prev) => {
              const map = new Map();
              prev.forEach((c: any) => map.set(c.id, c));
              cd.data.forEach((c: any) => map.set(c.id, c));
              return Array.from(map.values());
            });
          }
        }
      } catch (err) {
        console.error("Server customer search failed in invoice:", err);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerSearch, selectedCustomer]);

  // Live server product search when typing in searchQuery
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term) return;

    const activeRow = rows.find((r) => r.id === openRowId);
    const selProd = activeRow ? products.find((p) => p.id === activeRow.productId) : null;
    if (selProd && term.toLowerCase() === (selProd.name || "").toLowerCase()) {
      return;
    }

    let cancelled = false;
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    const timer = setTimeout(async () => {
      try {
        const cleanTerm = term.replace(/^ct[:\s\-\/]?\s*/i, "").trim();
        if (!cleanTerm) return;
        const res = await fetch(
          `/api/v1/inventory?status=active&limit=50&search=${encodeURIComponent(cleanTerm)}&sortBy=name&sortOrder=asc`,
          { headers }
        );
        if (res.ok) {
          const pd = await res.json();
          if (pd.data && Array.isArray(pd.data) && !cancelled) {
            const mapped = (pd.data || []).map((row: any) => {
              const meta = row.metadata || {};
              const hasSingleDefaultSize = Boolean(
                row.has_single_default_size ??
                meta.has_single_default_size ??
                (Number(row.default_width || row.defaultWidth) > 0 && Number(row.default_length || row.defaultLength) > 0)
              );
              const hasMultipleSizes = Boolean(
                row.has_multiple_sizes !== null && row.has_multiple_sizes !== undefined
                  ? Boolean(row.has_multiple_sizes)
                  : row.hasMultipleSizes !== undefined
                  ? Boolean(row.hasMultipleSizes)
                  : meta.hasMultipleSizes !== undefined
                  ? Boolean(meta.hasMultipleSizes)
                  : false
              );
              const defaultMode: "A" | "B" =
                row.tally_billing_mode === "A" || row.tallyBillingMode === "A" || meta.billingMode === "A" ? "A" : "B";

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
                    : row.salePrice != null
                    ? Number(row.salePrice) / 100
                    : row.base_rate || 0,
                hsn_code: row.hsn_code || row.hsnCode || "",
                gst_rate: row.gst_rate || row.gstRate || 18,
                unit_of_measure: uom,
                tally_billing_mode: (row.tally_billing_mode as any) || (row.tallyBillingMode as any) || defaultMode,
                has_multiple_sizes: hasMultipleSizes,
                default_width: row.default_width != null ? Number(row.default_width) : (row.defaultWidth != null ? Number(row.defaultWidth) : 1),
                default_length: row.default_length != null ? Number(row.default_length) : (row.defaultLength != null ? Number(row.defaultLength) : 1),
              };
            });

            setProducts((prev) => {
              const map = new Map();
              prev.forEach((p) => map.set(p.id, p));
              mapped.forEach((p: any) => map.set(p.id, p));
              return Array.from(map.values());
            });
          }
        }
      } catch (err) {
        console.error("Server product search failed in invoice:", err);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, openRowId, rows, products]);

  // Windowing Limits
  useEffect(() => {
    setProductLimit(100);
  }, [searchQuery, selectedCategory, openRowId]);

  useEffect(() => {
    setCustomerLimit(100);
  }, [customerSearch, customerDropdownOpen]);

  const visibleProducts = useMemo(() => {
    return matchedProducts.slice(0, Math.max(productLimit, highlightProductIndex + 20));
  }, [matchedProducts, productLimit, highlightProductIndex]);

  const visibleCustomers = useMemo(() => {
    return sortedCustomers.slice(0, Math.max(customerLimit, highlightCustomerIndex + 20));
  }, [sortedCustomers, customerLimit, highlightCustomerIndex]);

  const handleProductScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 350) {
      setProductLimit((prev) => Math.min(matchedProducts.length, prev + 100));
    }
  };

  const handleCustomerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 350) {
      setCustomerLimit((prev) => Math.min(sortedCustomers.length, prev + 100));
    }
  };

  // High performance instant scroll on Arrow navigation
  useEffect(() => {
    if (openRowId && highlightProductIndex >= 0) {
      const el = document.getElementById(`stock-item-${highlightProductIndex}`);
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightProductIndex, openRowId]);

  useEffect(() => {
    if (customerDropdownOpen && highlightCustomerIndex >= 0) {
      const el = document.getElementById(`customer-item-${highlightCustomerIndex}`);
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightCustomerIndex, customerDropdownOpen]);

  // Auto-focus new row's product input with End-of-List pre-selected
  useEffect(() => {
    if (pendingFocusNewRow && rows.length > 0) {
      const latestRow = rows[rows.length - 1];
      setPendingFocusNewRow(false);
      setTimeout(() => {
        const el = document.getElementById(`row-${latestRow.id}-product-input`);
        if (el) {
          el.focus();
          setOpenRowId(latestRow.id);
          setSearchQuery("");
          setHighlightProductIndex(-1);
        }
      }, 60);
    }
  }, [rows.length, pendingFocusNewRow]);

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

  const handleSaveDescAndAdvance = (rowId: string, text: string) => {
    updateRow(rowId, { description: text });
    setActiveDescRowId(null);
    setTimeout(() => {
      const prod = products.find((p) => p.id === rows.find((r) => r.id === rowId)?.productId);
      const rawUom = String((prod as any)?.unit_of_measure || (prod as any)?.tally_uom || 'sqft').trim().toLowerCase();
      const cleanUom = rawUom.replace(/[\s\._-]/g, '');
      const hasMultipleSizes = Boolean((prod as any)?.has_multiple_sizes ?? (prod as any)?.hasMultipleSizes);
      const hasSingleDefaultSize = Boolean((prod as any)?.has_single_default_size ?? (prod as any)?.metadata?.has_single_default_size ?? (Number((prod as any)?.default_width) > 0 && Number((prod as any)?.default_length) > 0));
      const isSizeInputActive = hasMultipleSizes || hasSingleDefaultSize;
      if (isSizeInputActive) {
        const el = document.getElementById(`row-${rowId}-width`);
        if (el) {
          el.focus();
        }
      } else {
        const el = document.getElementById(`row-${rowId}-quantity`);
        if (el) {
          el.focus();
        }
      }
    }, 60);
  };

  const handleBackFromDescModal = (rowId: string) => {
    setActiveDescRowId(null);
    setTimeout(() => {
      const itemInput = document.getElementById(`row-${rowId}-product-input`);
      if (itemInput) {
        setOpenRowId(rowId);
        itemInput.focus();
      }
    }, 50);
  };

  const handleEndOfList = (rowId: string) => {
    setOpenRowId(null);
    setSearchQuery("");
    const r = rows.find((item) => item.id === rowId);
    if (r && !r.productId && rows.length > 1) {
      removeRow(rowId);
    }
    setTimeout(() => {
      const logisticsBtn = document.getElementById("logistics-dropdown-btn");
      if (logisticsBtn) {
        logisticsBtn.focus();
        logisticsBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        const nextEl = document.getElementById("ref-type-new-ref") || document.getElementById("invoice-notes") || document.getElementById("submit-invoice-btn");
        if (nextEl) {
          nextEl.focus();
          nextEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }, 80);
  };

  const handleRowFinalEnter = (rowIndex: number) => {
    const isLastRow = rowIndex === rows.length - 1;
    if (isLastRow) {
      const currentRow = rows[rowIndex];
      if (currentRow && !currentRow.productId) {
        const el = document.getElementById(`row-${currentRow.id}-product-input`);
        if (el) {
          el.focus();
          setOpenRowId(currentRow.id);
          setSearchQuery("");
          setHighlightProductIndex(-1);
        }
        return;
      }
      setPendingFocusNewRow(true);
      addRow();
    } else {
      const nextRow = rows[rowIndex + 1];
      if (nextRow) {
        setTimeout(() => {
          const nextEl = document.getElementById(`row-${nextRow.id}-product-input`);
          if (nextEl) {
            nextEl.focus();
            setOpenRowId(nextRow.id);
            setSearchQuery("");
            setHighlightProductIndex(-1);
          }
        }, 50);
      }
    }
  };

  // Calculations
  const calculatedRows = useMemo(() => {
    return rows.map((row) => {
      const prod = products.find((p) => p.id === row.productId || p.code === row.productId);
      const isSqft = prod ? Boolean(prod.has_multiple_sizes) : false;
      const isModeA = row.billingMode === "A";
      const isModeB = !isModeA;

      const w = Number(row.width || (prod?.default_width ?? 1)) || 0;
      const h = Number(row.height || (prod?.default_length ?? 1)) || 0;
      const wFt = row.widthUnit === "IN" ? w / 12 : (row.widthUnit === "MTR" ? w * 3.28084 : w);
      const hFt = row.heightUnit === "IN" ? h / 12 : (row.heightUnit === "MTR" ? h * 3.28084 : h);
      const sqft = isSqft ? (wFt > 0 && hFt > 0 ? wFt * hFt : 0) : 0;
      const pcs = Math.max(1, Number(row.pcsNo || "1"));
      const totalBilledSqft = sqft * pcs;

      const baseRate =
        row.manualRate !== undefined && row.manualRate !== ""
          ? Number(row.manualRate) || 0
          : 0;
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
    const rawTotal = subtotal + taxTotal;
    const grandTotal = Math.round(rawTotal);
    const roundOff = Number((grandTotal - rawTotal).toFixed(2));
    const cgst = taxTotal / 2;
    const sgst = taxTotal / 2;

    return {
      subtotal,
      taxTotal,
      cgst,
      sgst,
      roundOff,
      grandTotal,
    };
  }, [calculatedRows]);

  const lastFocusedElementIdRef = useRef<string | null>(null);

  // Keep track of the last active input/select/button on the page
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.id) {
        if (!target.closest('[role="dialog"]') && !target.id.startsWith("modal-")) {
          lastFocusedElementIdRef.current = target.id;
        }
      }
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  // Keyboard shortcut: Ctrl + Enter & Alt + C for Create Customer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        const dateInput = document.getElementById("invoice-date-input") as HTMLInputElement;
        if (dateInput) {
          dateInput.focus();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        openDrawer("contact");
      } else if (e.key === "Escape") {
        if (customerDropdownOpen) setCustomerDropdownOpen(false);
        if (openRowId) setOpenRowId(null);
        if (logisticsDropdownOpen) setLogisticsDropdownOpen(false);
        return;
      }

      // Smart Focus Recovery: If user clicks outside and focus lands on body / background,
      // pressing Enter, Backspace, Arrow keys, or typing instantly restores focus to their last active box!
      const activeEl = document.activeElement;
      const isBodyOrBg =
        !activeEl ||
        activeEl === document.body ||
        activeEl.tagName === "BODY" ||
        activeEl.tagName === "HTML" ||
        activeEl.id === "__next" ||
        (activeEl.tagName === "DIV" && !activeEl.getAttribute("tabindex"));

      if (isBodyOrBg) {
        if (["Control", "Alt", "Shift", "Meta", "F12", "F5"].includes(e.key)) return;

        const targetId = lastFocusedElementIdRef.current;
        let targetEl = targetId ? document.getElementById(targetId) : null;

        if (!targetEl) {
          if (rows && rows.length > 0) {
            targetEl = document.getElementById(`row-${rows[0].id}-product-input`);
          }
          if (!targetEl) {
            targetEl = document.getElementById("invoice-customer-search-input");
          }
        }

        if (targetEl) {
          targetEl.focus();
          if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
            try {
              const len = targetEl.value ? targetEl.value.length : 0;
              targetEl.setSelectionRange(len, len);
            } catch {}
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedCustomerId,
    selectedCustomer,
    refType,
    selectedCreditId,
    calculatedRows,
    rows,
    issueDate,
    dueDate,
    reference,
    notes,
    deliveryType,
    shippingAddress,
    forApproval,
    isDepositRetainer,
    depositPercent,
    customerDropdownOpen,
    openRowId,
    logisticsDropdownOpen,
  ]);

  const handleSubmit = async () => {
    if (saving) return;
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

    const invalidRateRow = validRows.find((r) => !r.manualRate || Number(r.manualRate) <= 0);
    if (invalidRateRow) {
      toast.error("All items must have a rate greater than 0");
      const rateEl = document.getElementById(`row-${invalidRateRow.id}-rate`);
      if (rateEl) rateEl.focus();
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
              deliveryType ? `Delivery Mode: ${deliveryType}` : "",
              shippingAddress ? `Delivery Address: ${shippingAddress}` : "",
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
            deliveryMode: deliveryType || null,
            deliveryAmount: null,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create invoice");
      }

      const data = await res.json();
      const inv = data.invoice || data;
      toast.success(
        forApproval
          ? `Invoice ${inv?.invoiceNumber || ""} submitted for approval`
          : `Invoice ${inv?.invoiceNumber || ""} created successfully!`
      );
      if (inv?.id) {
        router.push(`/accounting/sales/${inv.id}`);
      }
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white/80 hover:bg-white rounded-xl border border-slate-200 transition-all shadow-xs cursor-pointer"
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
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white/80 hover:bg-white rounded-xl border border-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:scale-[1.02] active:scale-95 rounded-xl shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 cursor-pointer"
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
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 leading-tight flex items-center justify-between gap-1">
                      <span>Issue Date</span>
                      <kbd className="text-[9px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1 rounded">F2</kbd>
                    </span>
                    <input
                      id="invoice-date-input"
                      type="text"
                      inputMode="numeric"
                      value={dateDisplayInput}
                      onChange={(e) => setDateDisplayInput(e.target.value)}
                      onBlur={() => {
                        const parsed = parseTallyDate(dateDisplayInput, issueDate);
                        setIssueDate(parsed);
                        setDateDisplayInput(isoToDisplayDate(parsed));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const parsed = parseTallyDate(dateDisplayInput, issueDate);
                          setIssueDate(parsed);
                          setDateDisplayInput(isoToDisplayDate(parsed));
                          const custInput = document.getElementById("invoice-customer-search-input");
                          if (custInput) custInput.focus();
                        }
                      }}
                      placeholder="DD-MM-YYYY"
                      className="h-10 w-32 bg-slate-50 hover:bg-slate-100 focus:bg-white text-slate-800 font-mono font-bold text-xs px-3 rounded-xl border-2 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all cursor-text"
                      title="Issue Date (DD-MM-YYYY, Press F2)"
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
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
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
                        const target = e.currentTarget;
                        if (selectedCustomer) {
                          setCustomerSearch(selectedCustomer.displayName || selectedCustomer.name || "");
                          setTimeout(() => {
                            try {
                              const len = target.value ? target.value.length : 0;
                              target.setSelectionRange(len, len);
                            } catch {}
                          }, 20);
                        } else {
                          setCustomerSearch("");
                        }
                        setHighlightCustomerIndex(0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "End") {
                          e.preventDefault();
                          const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                          e.currentTarget.setSelectionRange(len, len);
                          return;
                        } else if (e.key === "Home") {
                          e.preventDefault();
                          e.currentTarget.setSelectionRange(0, 0);
                          return;
                        } else if (e.key === "ArrowRight") {
                          const { selectionStart, selectionEnd, value } = e.currentTarget;
                          if (selectionStart !== selectionEnd) {
                            e.preventDefault();
                            const len = value ? value.length : 0;
                            e.currentTarget.setSelectionRange(len, len);
                            return;
                          }
                        } else if (e.key === "ArrowLeft") {
                          const { selectionStart, selectionEnd } = e.currentTarget;
                          if (selectionStart !== selectionEnd) {
                            e.preventDefault();
                            e.currentTarget.setSelectionRange(0, 0);
                            return;
                          }
                        } else if (e.key === "ArrowDown") {
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
                              const firstRow = rows[0];
                              if (firstRow) {
                                setOpenRowId(firstRow.id);
                                setSearchQuery("");
                              }
                              setTimeout(() => {
                                const row0Input = document.getElementById(`row-${rows[0]?.id || 0}-product-input`);
                                if (row0Input) row0Input.focus();
                              }, 60);
                            }
                          } else if (selectedCustomer || selectedCustomerId) {
                            e.preventDefault();
                            setCustomerDropdownOpen(false);
                            const firstRow = rows[0];
                            if (firstRow) {
                              setOpenRowId(firstRow.id);
                              setSearchQuery("");
                            }
                            const row0Input = document.getElementById(`row-${rows[0]?.id || 0}-product-input`);
                            if (row0Input) row0Input.focus();
                          }
                        } else if (e.key === "Escape") {
                          setCustomerDropdownOpen(false);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setCustomerDropdownOpen(false);
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

            {/* ORDER ITEMS TABLE CARD WITH EMBEDDED VERTICAL PRICING DETAILS */}
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
                      <th className="py-1.5 px-2 min-w-[220px] text-left">Name of Item</th>
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
                      <th className="py-1.5 px-2 w-[95px] text-right">Amount</th>
                      <th className="py-1.5 px-1 w-9 text-center">×</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {calculatedRows.map((row, index) => {
                      const prod = products.find((p) => p.id === row.productId || p.code === row.productId);
                      const isSqft = prod ? Boolean(prod.has_multiple_sizes) : false;
                      const isModeA = row.billingMode === "A";
                      const isModeB = !isModeA;
                      const isOpen = openRowId === row.id && !activeDescRowId;

                      return (
                        <tr key={row.id} className="group transition-colors hover:bg-slate-50/50 align-top">
                          {/* Row Number */}
                          <td className="py-1 px-1.5 text-center tabular-nums align-top">
                            <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-400">
                              {index + 1}
                            </div>
                          </td>

                          {/* Product Selection + Additional Description Modal trigger */}
                          <td className="py-1 px-2 tabular-nums align-top">
                            <div className="space-y-1 min-w-[220px]">
                              <div className="relative w-full">
                                <div
                                  className={`flex h-10 w-full items-center rounded-lg px-3 transition-all duration-150 ${
                                    isOpen
                                      ? "border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-sm"
                                      : activeDescRowId
                                      ? "border-2 border-slate-200 bg-slate-50"
                                      : "border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white"
                                  }`}
                                >
                                  <input
                                    id={`row-${row.id}-product-input`}
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
                                      const currentName = row.productName || prod?.name || "";
                                      setSearchQuery(currentName);
                                      const currIdx = matchedProducts.findIndex((p) => p.id === row.productId);
                                      setHighlightProductIndex(currIdx >= 0 ? currIdx : !currentName ? -1 : 0);
                                      setTimeout(() => {
                                        try {
                                          const el = e.target as HTMLInputElement;
                                          const len = el.value ? el.value.length : 0;
                                          el.setSelectionRange(len, len);
                                        } catch {}
                                      }, 10);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        if (!isOpen) {
                                          setOpenRowId(row.id);
                                          setHighlightProductIndex(0);
                                          return;
                                        }
                                        setHighlightProductIndex((prev) =>
                                          prev === -1 ? 0 : Math.min(prev + 1, visibleProducts.length - 1)
                                        );
                                      } else if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        setHighlightProductIndex((prev) => {
                                          if (prev <= 0 && !searchQuery.trim()) return -1;
                                          return Math.max(prev - 1, 0);
                                        });
                                      } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        // End of list
                                        if (highlightProductIndex === -1) {
                                          handleEndOfList(row.id);
                                          return;
                                        }
                                        if (isOpen && visibleProducts.length > 0 && highlightProductIndex >= 0) {
                                          const p = visibleProducts[highlightProductIndex] || visibleProducts[0];
                                          if (p) {
                                            updateRow(row.id, {
                                              productId: p.id,
                                              productName: p.name,
                                              hsnCode: p.hsn_code || "",
                                              billingMode: p.tally_billing_mode || "B",
                                              gstRate: p.gst_rate || 18,
                                              manualRate: "",
                                            });
                                            setOpenRowId(null);
                                            setSearchQuery("");
                                            setHighlightProductIndex(0);
                                            setTimeout(() => {
                                              setActiveDescRowId(row.id);
                                            }, 50);
                                            return;
                                          }
                                        }
                                        setOpenRowId(null);
                                        setTimeout(() => {
                                          setActiveDescRowId(row.id);
                                        }, 50);
                                      } else if (e.key === "Escape") {
                                        setOpenRowId(null);
                                      } else if (e.key === "Backspace") {
                                        if (!searchQuery && !row.productId && index > 0) {
                                          e.preventDefault();
                                          removeRow(row.id);
                                          const prevRow = calculatedRows[index - 1];
                                          if (prevRow) {
                                            const prevEl = document.getElementById(`row-${prevRow.id}-finish`);
                                            if (prevEl) prevEl.focus();
                                          }
                                        }
                                      }
                                    }}
                                    onBlur={() => {
                                      setTimeout(() => {
                                        setOpenRowId(null);
                                      }, 200);
                                    }}
                                    className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                  />
                                  <ChevronDown
                                    size={14}
                                    className={`cursor-pointer transition-colors ${
                                      isOpen ? "text-blue-600" : "text-slate-400"
                                    }`}
                                    onClick={() => {
                                      if (isOpen) {
                                        setOpenRowId(null);
                                      } else {
                                        setOpenRowId(row.id);
                                        setSearchQuery(row.productName || prod?.name || "");
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Tally Additional Description Line */}
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <span className="text-[10px] font-bold text-slate-400 select-none pl-1" title="Tally Additional Description">↳</span>
                                <input
                                  id={`row-${row.id}-description`}
                                  value={row.description || ""}
                                  readOnly
                                  tabIndex={-1}
                                  onClick={() => {
                                    setOpenRowId(null);
                                    setActiveDescRowId(row.id);
                                  }}
                                  placeholder="Description / notes (optional)..."
                                  className="h-7 w-full rounded-md border border-slate-200 bg-slate-50/70 px-2 text-[11px] font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all shadow-2xs cursor-pointer truncate"
                                  title="Additional Description for stock item (like Tally Prime)"
                                />
                              </div>
                            </div>
                          </td>

                          {/* HSN Code */}
                          <td className="py-1 px-1 text-center tabular-nums align-top">
                            <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-500">
                              {prod?.hsn_code || row.hsnCode || "—"}
                            </div>
                          </td>

                          {/* GST % */}
                          <td className="py-1 px-1 text-center tabular-nums align-top">
                            <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-600">
                              {prod?.gst_rate || row.gstRate || 18}%
                            </div>
                          </td>

                          {/* Billing Mode (T) */}
                          <td className="py-1 px-1 text-center tabular-nums align-top">
                            <div className="h-10 flex items-center justify-center">
                              <span
                                className={`h-10 min-w-[36px] px-2.5 rounded-lg border-2 font-black text-xs inline-flex items-center justify-center shadow-sm select-none cursor-not-allowed ${
                                  row.billingMode === "A"
                                    ? "border-blue-600 bg-blue-600 text-white"
                                    : "border-emerald-600 bg-emerald-600 text-white"
                                }`}
                                title={`Mode ${row.billingMode} — Locked to Item Master`}
                              >
                                {row.billingMode || "B"}
                              </span>
                            </div>
                          </td>

                          {/* Width */}
                          <td className="py-1 px-1 tabular-nums align-top">
                            <div className="h-10 flex items-center justify-center">
                              {!isSqft ? (
                                <div className="h-10 w-[90px] flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-lg font-bold">—</div>
                              ) : (
                                <div className="flex h-10 w-[90px] items-center rounded-lg border-2 border-slate-200 bg-slate-50 px-1 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/20">
                                  <input
                                    id={`row-${row.id}-width`}
                                    value={row.width}
                                    onChange={(e) => updateRow(row.id, { width: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === "End") {
                                        e.preventDefault();
                                        const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                        e.currentTarget.setSelectionRange(len, len);
                                      } else if (e.key === "Home") {
                                        e.preventDefault();
                                        e.currentTarget.setSelectionRange(0, 0);
                                      } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        const hEl = document.getElementById(`row-${row.id}-height`);
                                        if (hEl) {
                                          hEl.focus();
                                        }
                                      } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setOpenRowId(row.id);
                                        const itemInput = document.getElementById(`row-${row.id}-product-input`);
                                        if (itemInput) {
                                          itemInput.focus();
                                        }
                                      }
                                    }}
                                    className="w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                    placeholder="W"
                                  />
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setOpenUnitPickerId(openUnitPickerId === `${row.id}-w` ? null : `${row.id}-w`)
                                      }
                                      className="flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-200"
                                    >
                                      {row.widthUnit === "FT" ? "ft" : row.widthUnit === "IN" ? "in" : "m"}
                                      <ChevronDown size={10} />
                                    </button>
                                    {openUnitPickerId === `${row.id}-w` && (
                                      <div className="absolute right-0 top-full mt-1 z-[9999] w-14 rounded-xl border-2 border-blue-600 bg-white shadow-2xl overflow-hidden">
                                        {["FT", "IN", "MTR"].map((u) => (
                                          <button
                                            key={u}
                                            type="button"
                                            onClick={() => {
                                              updateRow(row.id, { widthUnit: u as any });
                                              setOpenUnitPickerId(null);
                                            }}
                                            className={`w-full py-1.5 text-center text-[11px] font-black ${
                                              row.widthUnit === u
                                                ? "bg-blue-600 text-white"
                                                : "text-slate-600 hover:bg-slate-50"
                                            }`}
                                          >
                                            {u === "MTR" ? "m" : u.toLowerCase()}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Length */}
                          <td className="py-1 px-1 tabular-nums align-top">
                            <div className="h-10 flex items-center justify-center">
                              {!isSqft ? (
                                <div className="h-10 w-[90px] flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-lg font-bold">—</div>
                              ) : (
                                <div className="flex h-10 w-[90px] items-center rounded-lg border-2 border-slate-200 bg-slate-50 px-1 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/20">
                                  <input
                                    id={`row-${row.id}-height`}
                                    value={row.height}
                                    onChange={(e) => updateRow(row.id, { height: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === "End") {
                                        e.preventDefault();
                                        const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                        e.currentTarget.setSelectionRange(len, len);
                                      } else if (e.key === "Home") {
                                        e.preventDefault();
                                        e.currentTarget.setSelectionRange(0, 0);
                                      } else if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (isModeB) {
                                          const pcsEl = document.getElementById(`row-${row.id}-pcs`);
                                          if (pcsEl) {
                                            pcsEl.focus();
                                          }
                                        } else {
                                          const qtyEl = document.getElementById(`row-${row.id}-quantity`);
                                          if (qtyEl) {
                                            qtyEl.focus();
                                          }
                                        }
                                      } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                        e.preventDefault();
                                        const wEl = document.getElementById(`row-${row.id}-width`);
                                        if (wEl) {
                                          wEl.focus();
                                        }
                                      }
                                    }}
                                    className="w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                    placeholder="L"
                                  />
                                  <div className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setOpenUnitPickerId(openUnitPickerId === `${row.id}-h` ? null : `${row.id}-h`)
                                      }
                                      className="flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-200"
                                    >
                                      {row.heightUnit === "FT" ? "ft" : row.heightUnit === "IN" ? "in" : "m"}
                                      <ChevronDown size={10} />
                                    </button>
                                    {openUnitPickerId === `${row.id}-h` && (
                                      <div className="absolute right-0 top-full mt-1 z-[9999] w-14 rounded-xl border-2 border-blue-600 bg-white shadow-2xl overflow-hidden">
                                        {["FT", "IN", "MTR"].map((u) => (
                                          <button
                                            key={u}
                                            type="button"
                                            onClick={() => {
                                              updateRow(row.id, { heightUnit: u as any });
                                              setOpenUnitPickerId(null);
                                            }}
                                            className={`w-full py-1.5 text-center text-[11px] font-black ${
                                              row.heightUnit === u
                                                ? "bg-blue-600 text-white"
                                                : "text-slate-600 hover:bg-slate-50"
                                            }`}
                                          >
                                            {u === "MTR" ? "m" : u.toLowerCase()}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Sq. Ft. */}
                          <td className="py-1 px-1 text-center tabular-nums align-top">
                            <div className="h-10 flex items-center justify-center text-xs font-bold text-slate-700">
                              {row.sqft > 0 ? row.sqft.toFixed(2) : "—"}
                            </div>
                          </td>

                          {/* Pcs/No */}
                          <td className="py-1 px-1 tabular-nums text-center align-top">
                            <div className="h-10 flex items-center justify-center">
                              {isSqft && isModeB ? (
                                <input
                                  id={`row-${row.id}-pcs`}
                                  value={row.pcsNo}
                                  onChange={(e) => updateRow(row.id, { pcsNo: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "End") {
                                      e.preventDefault();
                                      const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                      e.currentTarget.setSelectionRange(len, len);
                                    } else if (e.key === "Home") {
                                      e.preventDefault();
                                      e.currentTarget.setSelectionRange(0, 0);
                                    } else if (e.key === "Enter") {
                                      e.preventDefault();
                                      const rateEl = document.getElementById(`row-${row.id}-rate`);
                                      if (rateEl) {
                                        rateEl.focus();
                                      }
                                    } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                      e.preventDefault();
                                      const hEl = document.getElementById(`row-${row.id}-height`);
                                      if (hEl) {
                                        hEl.focus();
                                      }
                                    }
                                  }}
                                  className="h-10 w-[70px] bg-slate-50 border-2 border-slate-200 rounded-lg text-center text-xs font-bold focus:bg-white focus:border-blue-600 outline-none"
                                />
                              ) : (
                                <div className="h-10 w-[70px] flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-lg font-bold">1</div>
                              )}
                            </div>
                          </td>

                          {/* Quantity */}
                          <td className="py-1 px-1 tabular-nums text-center align-top">
                            <div className="h-10 flex items-center justify-center">
                              {isSqft && isModeB ? (
                                <div className="h-10 w-[100px] flex items-center justify-center text-xs font-bold font-mono text-slate-700 bg-slate-100 rounded-lg">
                                  {row.totalBilledSqft.toFixed(2)}
                                </div>
                              ) : (
                                <input
                                  id={`row-${row.id}-quantity`}
                                  value={row.quantity}
                                  onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "End") {
                                      e.preventDefault();
                                      const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                      e.currentTarget.setSelectionRange(len, len);
                                    } else if (e.key === "Home") {
                                      e.preventDefault();
                                      e.currentTarget.setSelectionRange(0, 0);
                                    } else if (e.key === "Enter") {
                                      e.preventDefault();
                                      const rateEl = document.getElementById(`row-${row.id}-rate`);
                                      if (rateEl) {
                                        rateEl.focus();
                                      }
                                    } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (isSqft) {
                                        const hEl = document.getElementById(`row-${row.id}-height`);
                                        if (hEl) {
                                          hEl.focus();
                                        }
                                      } else {
                                        setOpenRowId(row.id);
                                        const itemInput = document.getElementById(`row-${row.id}-product-input`);
                                        if (itemInput) {
                                          itemInput.focus();
                                        }
                                      }
                                    }
                                  }}
                                  className="h-10 w-[100px] bg-slate-50 border-2 border-slate-200 rounded-lg text-center text-xs font-bold focus:bg-white focus:border-blue-600 outline-none"
                                />
                              )}
                            </div>
                          </td>

                          {/* Rate / SqFt */}
                          <td className="py-1 px-1 align-top text-center">
                            <div className="h-10 flex items-center justify-center">
                              <input
                                id={`row-${row.id}-rate`}
                                inputMode="decimal"
                                value={row.manualRate !== undefined ? row.manualRate : ""}
                                placeholder="0.00"
                                onChange={(e) => updateRow(row.id, { manualRate: e.target.value })}
                                onFocus={(e) => {
                                  try {
                                    const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                    e.currentTarget.setSelectionRange(len, len);
                                  } catch {}
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "End") {
                                    e.preventDefault();
                                    const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                                    e.currentTarget.setSelectionRange(len, len);
                                  } else if (e.key === "Home") {
                                    e.preventDefault();
                                    e.currentTarget.setSelectionRange(0, 0);
                                  } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    const finishEl = document.getElementById(`row-${row.id}-finish`);
                                    if (finishEl) {
                                      finishEl.focus();
                                    }
                                  } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && ((e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) || !e.currentTarget.value)) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isSqft && isModeB) {
                                      const pcsEl = document.getElementById(`row-${row.id}-pcs`);
                                      if (pcsEl) {
                                        pcsEl.focus();
                                      }
                                    } else {
                                      const qtyEl = document.getElementById(`row-${row.id}-quantity`);
                                      if (qtyEl) {
                                        qtyEl.focus();
                                      } else {
                                        setOpenRowId(row.id);
                                        const itemInput = document.getElementById(`row-${row.id}-product-input`);
                                        if (itemInput) {
                                          itemInput.focus();
                                        }
                                      }
                                    }
                                  }
                                }}
                                className="h-10 w-[90px] text-center bg-slate-50 border-2 border-slate-200 rounded-lg text-xs font-mono font-bold focus:bg-white focus:border-blue-600 outline-none"
                              />
                            </div>
                          </td>

                          {/* Rate Per Unit */}
                          <td className="py-1 px-1 align-top text-center">
                            <div className="h-10 flex items-center justify-center font-mono text-xs text-slate-500 font-bold">
                              ₹{row.baseRate > 0 ? row.baseRate.toFixed(2) : "0.00"}
                            </div>
                          </td>

                          {/* Finish Amount */}
                          <td className="py-1 px-1 align-top text-center">
                            <div className="h-10 flex items-center justify-center">
                              <input
                                id={`row-${row.id}-finish`}
                                inputMode="decimal"
                                value={row.finishAmount}
                                onChange={(e) => updateRow(row.id, { finishAmount: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleRowFinalEnter(index);
                                  } else if ((e.key === "Backspace" || e.key === "ArrowLeft") && (e.currentTarget.selectionStart === 0 || !e.currentTarget.value)) {
                                    e.preventDefault();
                                    const rateEl = document.getElementById(`row-${row.id}-rate`);
                                    if (rateEl) {
                                      rateEl.focus();
                                    }
                                  }
                                }}
                                className="h-10 w-[90px] text-center bg-slate-50 border-2 border-slate-200 rounded-lg text-xs font-mono font-medium focus:bg-white focus:border-blue-600 outline-none"
                              />
                            </div>
                          </td>

                          {/* Line Total Amount */}
                          <td className="py-1 px-2 align-top text-right">
                            <div className="h-10 flex items-center justify-end font-mono font-black text-xs text-slate-900">
                              ₹{row.lineAmount.toFixed(2)}
                            </div>
                          </td>

                          {/* Delete Button */}
                          <td className="py-1 px-1 align-top text-center">
                            <div className="h-10 flex items-center justify-center">
                              <button
                                type="button"
                                disabled={calculatedRows.length <= 1}
                                onClick={() => removeRow(row.id)}
                                className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${
                                  calculatedRows.length <= 1
                                    ? "opacity-20 cursor-not-allowed text-slate-400 bg-slate-100"
                                    : "bg-rose-50 text-rose-500 hover:bg-rose-100 cursor-pointer"
                                }`}
                                title="Delete row"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Section Header: PRICING DETAILS (Vertical Layout like Proxy Order) */}
                    <tr className="border-t-2 border-slate-200 bg-slate-100/50">
                      <td className="py-1 px-2"></td>
                      <td colSpan={12} className="py-1 px-2 text-[10px] font-black uppercase tracking-widest text-slate-700">
                        PRICING DETAILS
                      </td>
                      <td className="py-1 px-2"></td>
                      <td className="py-1 px-2"></td>
                    </tr>

                    {/* 1. SGST / CGST Ledger Rows */}
                    <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                      <td className="py-0.5 px-2"></td>
                      <td colSpan={12} className="py-0.5 px-2 font-bold text-slate-800">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>SGST</span>
                          {calculatedRows.length > 1 && (
                            <span className="text-[10px] font-semibold text-slate-500 font-mono">
                              ({calculatedRows.map((it) => (it.taxAmount / 2).toFixed(2)).join(" + ")})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-0.5 px-2 text-right font-black tabular-nums text-slate-900 font-mono">
                        {summary.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-0.5 px-2"></td>
                    </tr>

                    <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                      <td className="py-0.5 px-2"></td>
                      <td colSpan={12} className="py-0.5 px-2 font-bold text-slate-800">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>CGST</span>
                          {calculatedRows.length > 1 && (
                            <span className="text-[10px] font-semibold text-slate-500 font-mono">
                              ({calculatedRows.map((it) => (it.taxAmount / 2).toFixed(2)).join(" + ")})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-0.5 px-2 text-right font-black tabular-nums text-slate-900 font-mono">
                        {summary.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-0.5 px-2"></td>
                    </tr>

                    {/* 2. Round Off Ledger Row */}
                    <tr className="border-t border-slate-100 bg-slate-50/30 text-xs font-bold text-slate-800">
                      <td className="py-0.5 px-2"></td>
                      <td colSpan={12} className="py-0.5 px-2 font-bold text-slate-800">
                        Round Off
                      </td>
                      <td className="py-0.5 px-2 text-right font-bold tabular-nums text-slate-600 font-mono">
                        {summary.roundOff !== 0
                          ? summary.roundOff > 0
                            ? `+${summary.roundOff.toFixed(2)}`
                            : summary.roundOff.toFixed(2)
                          : "0.00"}
                      </td>
                      <td className="py-0.5 px-2"></td>
                    </tr>
                  </tbody>

                  {/* Tally Total Row */}
                  <tfoot>
                    <tr className="border-t-2 border-b border-slate-200 bg-slate-50/80 text-xs font-black text-slate-900">
                      <td className="py-1.5 px-2 text-center"></td>
                      <td colSpan={12} className="py-1.5 px-2 font-black uppercase tracking-wider text-slate-800">
                        TOTAL
                      </td>
                      <td className="py-1.5 px-2 text-right font-black tabular-nums text-sm text-slate-950 font-mono">
                        Rs. {summary.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-1.5 px-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Bottom Row: Logistics (Left) + Reference/Settlement & Action Terminal (Right) */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-start">
              {/* LEFT: Logistics Card */}
              <div className="rounded-[1.5rem] bg-white/50 p-4 pb-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Logistics</h3>
                </div>

                <div id="logistics-dropdown-container" className="relative">
                  <button
                    type="button"
                    id="logistics-dropdown-btn"
                    onClick={() => {
                      setLogisticsDropdownOpen((prev) => !prev);
                      if (!logisticsDropdownOpen) {
                        const idx = LOGISTICS_OPTIONS.findIndex((o) => o.id === deliveryType);
                        if (idx !== -1) setHighlightLogisticsIndex(idx);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Spacebar") {
                        e.preventDefault();
                        setLogisticsDropdownOpen((prev) => !prev);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (!logisticsDropdownOpen) setLogisticsDropdownOpen(true);
                        else setHighlightLogisticsIndex((prev) => (prev + 1) % LOGISTICS_OPTIONS.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (!logisticsDropdownOpen) setLogisticsDropdownOpen(true);
                        else setHighlightLogisticsIndex((prev) => (prev - 1 + LOGISTICS_OPTIONS.length) % LOGISTICS_OPTIONS.length);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (logisticsDropdownOpen) {
                          const selectedOpt = LOGISTICS_OPTIONS[highlightLogisticsIndex];
                          if (selectedOpt) {
                            setDeliveryType(selectedOpt.id as any);
                            setLogisticsDropdownOpen(false);
                            setTimeout(() => {
                              if (selectedOpt.id !== "selfPickup") {
                                const addrEl = document.getElementById("shipping-address-select") || document.getElementById("shipping-address-textarea");
                                if (addrEl) addrEl.focus();
                              } else {
                                const refBtn = document.getElementById("ref-type-new-ref");
                                if (refBtn) refBtn.focus();
                              }
                            }, 60);
                          }
                        } else {
                          if (deliveryType !== "selfPickup") {
                            const addrEl = document.getElementById("shipping-address-select") || document.getElementById("shipping-address-textarea");
                            if (addrEl) addrEl.focus();
                          } else {
                            const refBtn = document.getElementById("ref-type-new-ref");
                            if (refBtn) refBtn.focus();
                          }
                        }
                      } else if (["p", "d", "c", "t"].includes(e.key.toLowerCase())) {
                        const opt = LOGISTICS_OPTIONS.find((o) => o.key === e.key.toLowerCase());
                        if (opt) {
                          e.preventDefault();
                          setDeliveryType(opt.id as any);
                          setHighlightLogisticsIndex(LOGISTICS_OPTIONS.findIndex((o) => o.id === opt.id));
                        }
                      } else if (e.key === "Backspace") {
                        if (!logisticsDropdownOpen) {
                          e.preventDefault();
                          const lastRow = rows[rows.length - 1];
                          if (lastRow) {
                            const finishEl = document.getElementById(`row-${lastRow.id}-finish`);
                            if (finishEl) finishEl.focus();
                          }
                        }
                      }
                    }}
                    className={`flex h-11 w-full items-center justify-between rounded-xl border-2 px-3.5 text-sm font-black tracking-wide text-slate-800 transition-all hover:bg-slate-100/80 focus:outline-none cursor-pointer ${
                      logisticsDropdownOpen
                        ? "border-blue-600 bg-white ring-4 ring-blue-500/20"
                        : "border-slate-200 bg-slate-50 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20"
                    }`}
                  >
                    {(() => {
                      const cur = LOGISTICS_OPTIONS.find((o) => o.id === deliveryType) || LOGISTICS_OPTIONS[0];
                      return (
                        <>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-black text-white">
                              {cur.label.charAt(0)}
                            </span>
                            <div className="text-left">
                              <div className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                                <span>{cur.label}</span>
                                <span className="text-[10px] font-bold text-slate-400 normal-case">({cur.sublabel})</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-slate-400">
                            <ChevronDown
                              size={16}
                              className={`transition-transform duration-200 ${
                                logisticsDropdownOpen ? "rotate-180 text-blue-600" : ""
                              }`}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </button>

                  {/* Logistics Dropdown Menu */}
                  {logisticsDropdownOpen && (
                    <div className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-xl space-y-1">
                      {LOGISTICS_OPTIONS.map((opt, idx) => {
                        const isHighlighted = idx === highlightLogisticsIndex;
                        const isSelected = deliveryType === opt.id;
                        return (
                          <div
                            key={opt.id}
                            onClick={() => {
                              setDeliveryType(opt.id as any);
                              setLogisticsDropdownOpen(false);
                              setTimeout(() => {
                                if (opt.id !== "selfPickup") {
                                  const addrEl = document.getElementById("shipping-address-select") || document.getElementById("shipping-address-textarea");
                                  if (addrEl) addrEl.focus();
                                } else {
                                  const refBtn = document.getElementById("ref-type-new-ref");
                                  if (refBtn) refBtn.focus();
                                }
                              }, 60);
                            }}
                            onMouseEnter={() => setHighlightLogisticsIndex(idx)}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                              isHighlighted
                                ? "bg-blue-50 text-blue-900"
                                : isSelected
                                ? "bg-slate-100 text-slate-900 font-bold"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black ${
                                  isSelected ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
                                }`}
                              >
                                {opt.label.charAt(0)}
                              </span>
                              <div>
                                <span className="text-xs font-black uppercase tracking-wider">{opt.label}</span>
                                <span className="block text-[10px] text-slate-400 font-medium">{opt.sublabel}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <kbd className="text-[9px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                                {opt.key.toUpperCase()}
                              </kbd>
                              {isSelected && <Check size={14} className="text-blue-600 stroke-[3]" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {deliveryType !== "selfPickup" && (
                  <div className="mt-3 space-y-2">
                    {savedAddresses.length > 0 ? (
                      <>
                        <select
                          id="shipping-address-select"
                          className="h-10 w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white cursor-pointer"
                          value={shippingAddress}
                          onChange={(e) => setShippingAddress(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const refBtn = document.getElementById("ref-type-new-ref");
                              if (refBtn) refBtn.focus();
                            } else if (e.key === "Backspace") {
                              e.preventDefault();
                              const logBtn = document.getElementById("logistics-dropdown-btn");
                              if (logBtn) logBtn.focus();
                            }
                          }}
                        >
                          <option value="">Select Saved Delivery Address</option>
                          {savedAddresses.map((a, idx) => (
                            <option key={idx} value={a.address}>
                              {a.label}: {a.address}
                            </option>
                          ))}
                        </select>
                        <textarea
                          id="shipping-address-textarea"
                          rows={2}
                          value={shippingAddress}
                          onFocus={(e) => {
                            try {
                              const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                              e.currentTarget.setSelectionRange(len, len);
                            } catch {}
                          }}
                          onChange={(e) => setShippingAddress(e.target.value)}
                          placeholder="Or type custom destination address..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const refBtn = document.getElementById("ref-type-new-ref");
                              if (refBtn) refBtn.focus();
                            } else if (e.key === "Backspace" && (e.currentTarget.selectionStart === 0 || !e.currentTarget.value)) {
                              e.preventDefault();
                              const sel = document.getElementById("shipping-address-select");
                              if (sel) sel.focus();
                              else {
                                const logBtn = document.getElementById("logistics-dropdown-btn");
                                if (logBtn) logBtn.focus();
                              }
                            }
                          }}
                          className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium p-2.5 outline-none focus:border-blue-600"
                        />
                      </>
                    ) : (
                      <textarea
                        id="shipping-address-textarea"
                        rows={3}
                        value={shippingAddress}
                        onFocus={(e) => {
                          try {
                            const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                            e.currentTarget.setSelectionRange(len, len);
                          } catch {}
                        }}
                        onChange={(e) => setShippingAddress(e.target.value)}
                        placeholder="Enter delivery destination address..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const refBtn = document.getElementById("ref-type-new-ref");
                            if (refBtn) refBtn.focus();
                          } else if (e.key === "Backspace" && (e.currentTarget.selectionStart === 0 || !e.currentTarget.value)) {
                            e.preventDefault();
                            const logBtn = document.getElementById("logistics-dropdown-btn");
                            if (logBtn) logBtn.focus();
                          }
                        }}
                        className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium p-2.5 outline-none focus:border-blue-600"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* RIGHT: Reference & Settlement / Action Terminal Card */}
              <div className="rounded-[1.5rem] bg-white/50 p-4 pb-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Reference & Settlement
                  </h3>
                </div>

                {/* Settlement Ref Mode Tabs with Smooth Arrow Navigation */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    id="ref-type-new-ref"
                    onClick={() => {
                      setRefType("NEW_REF");
                      setSelectedCreditId("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight") {
                        e.preventDefault();
                        setRefType("AGST_REF");
                        const agstBtn = document.getElementById("ref-type-agst-ref");
                        if (agstBtn) agstBtn.focus();
                      } else if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setRefType("NEW_REF");
                        const notesEl = document.getElementById("invoice-notes");
                        if (notesEl) notesEl.focus();
                      } else if (e.key === "Backspace") {
                        e.preventDefault();
                        if (deliveryType !== "selfPickup") {
                          const addrEl = document.getElementById("shipping-address-textarea") || document.getElementById("shipping-address-select");
                          if (addrEl) addrEl.focus();
                        } else {
                          const logBtn = document.getElementById("logistics-dropdown-btn");
                          if (logBtn) logBtn.focus();
                        }
                      }
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer focus:outline-none ${
                      refType === "NEW_REF"
                        ? "bg-slate-900 text-white shadow-md ring-2 ring-blue-500/50"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 focus:bg-slate-200"
                    }`}
                  >
                    New Ref (Normal)
                  </button>
                  <button
                    type="button"
                    id="ref-type-agst-ref"
                    onClick={() => setRefType("AGST_REF")}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        setRefType("NEW_REF");
                        const newBtn = document.getElementById("ref-type-new-ref");
                        if (newBtn) newBtn.focus();
                      } else if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setRefType("AGST_REF");
                        setTimeout(() => {
                          const advSel = document.getElementById("select-advance-credit");
                          if (advSel) advSel.focus();
                          else {
                            const notesEl = document.getElementById("invoice-notes");
                            if (notesEl) notesEl.focus();
                          }
                        }, 50);
                      } else if (e.key === "Backspace") {
                        e.preventDefault();
                        const newBtn = document.getElementById("ref-type-new-ref");
                        if (newBtn) newBtn.focus();
                      }
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer focus:outline-none ${
                      refType === "AGST_REF"
                        ? "bg-amber-600 text-white shadow-md ring-2 ring-amber-500/50"
                        : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 focus:bg-amber-100"
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
                        id="select-advance-credit"
                        value={selectedCreditId}
                        onChange={(e) => setSelectedCreditId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const notesEl = document.getElementById("invoice-notes");
                            if (notesEl) notesEl.focus();
                          } else if (e.key === "Backspace") {
                            e.preventDefault();
                            const agstBtn = document.getElementById("ref-type-agst-ref");
                            if (agstBtn) agstBtn.focus();
                          }
                        }}
                        className="w-full bg-white text-xs font-bold rounded-lg border border-amber-300 p-2 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
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

                {/* Notes Input */}
                <div>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <div className="w-1 h-3 rounded-full bg-blue-500 flex-shrink-0" />
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 leading-tight">
                      Additional Notes / Remarks
                    </label>
                  </div>
                  <textarea
                    id="invoice-notes"
                    rows={2}
                    value={notes}
                    onFocus={(e) => {
                      try {
                        const len = e.currentTarget.value ? e.currentTarget.value.length : 0;
                        e.currentTarget.setSelectionRange(len, len);
                      } catch {}
                    }}
                    onChange={(e) => setNotes(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        const submitBtn = document.getElementById("submit-invoice-btn");
                        if (submitBtn) {
                          submitBtn.focus();
                          submitBtn.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                      } else if (e.key === "Backspace" && (e.currentTarget.selectionStart === 0 || !e.currentTarget.value)) {
                        e.preventDefault();
                        if (refType === "AGST_REF" && availableCredits.length > 0) {
                          const advSel = document.getElementById("select-advance-credit");
                          if (advSel) advSel.focus();
                          else {
                            const agstBtn = document.getElementById("ref-type-agst-ref");
                            if (agstBtn) agstBtn.focus();
                          }
                        } else {
                          const refBtn = document.getElementById("ref-type-new-ref");
                          if (refBtn) refBtn.focus();
                        }
                      }
                    }}
                    placeholder="Specific delivery instructions, PO terms, or internal notes (Enter to submit)..."
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-xs outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 focus:bg-white font-semibold resize-none transition-all"
                  />
                </div>

                {/* Action Submit Button */}
                <button
                  type="button"
                  id="submit-invoice-btn"
                  onClick={handleSubmit}
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace") {
                      e.preventDefault();
                      const notesEl = document.getElementById("invoice-notes");
                      if (notesEl) notesEl.focus();
                    }
                  }}
                  className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:scale-[1.01] active:scale-95 focus:scale-[1.01] focus:ring-4 focus:ring-blue-500/30 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer outline-none"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  CREATE INVOICE (CTRL+ENTER)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tally Full Vertical Right Sidebar Drawer (List of Ledger Accounts / List of Stock Items) */}
      {(customerDropdownOpen || openRowId) && !activeDescRowId && (
        <div className="fixed right-0 top-0 bottom-0 w-[900px] lg:w-[980px] max-w-[96vw] z-[99999] bg-[#eef6ff] border-l-2 border-[#1a4a7a] shadow-2xl flex flex-col animate-in slide-in-from-right duration-150 font-sans">
          {customerDropdownOpen ? (
            <>
              {/* Ledger Header */}
              <div className="bg-[#1a4a7a] text-white py-2 px-4 flex items-center justify-between border-b border-[#12365a] shrink-0 select-none">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-wide">List of Ledger Accounts</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomerDropdownOpen(false)}
                  className="h-5 px-2 rounded bg-[#12365a] hover:bg-[#0c2640] text-[10px] font-bold text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Esc</span> ✕
                </button>
              </div>

              {/* Column Subheader Bar */}
              <div className="bg-[#dbeafc] border-b border-[#bad5f5] text-[#1a3a60] text-[11px] font-bold py-1.5 px-4 flex items-center justify-between shrink-0 select-none">
                <div className="flex-1 font-bold">Name of Ledger</div>
                <div className="w-48 text-left shrink-0">City / Area</div>
                <div className="w-44 text-center shrink-0">GSTIN</div>
                <div className="w-32 text-right shrink-0">Balance</div>
              </div>

              {/* Top Actions: + Create (Alt+C) */}
              <div className="bg-[#e2f0fd] border-b border-[#bad5f5] py-1 px-3 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    openDrawer("contact");
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold tracking-wide transition-colors cursor-pointer"
                >
                  <Plus size={11} />
                  <span>Create (Alt+C)</span>
                </button>
                {customerSearch && (
                  <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-[#bad5f5]">
                    Filter: &ldquo;{customerSearch}&rdquo;
                  </span>
                )}
              </div>

              {/* Customer list */}
              <div onScroll={handleCustomerScroll} className="flex-1 overflow-y-auto bg-[#eef6ff]">
                {sortedCustomers.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-xs font-bold text-slate-500">No matching ledger accounts found</p>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        openDrawer("contact");
                      }}
                      className="mt-3 px-3 py-1 rounded bg-[#1a4a7a] text-white text-xs font-bold cursor-pointer"
                    >
                      + Create New Customer
                    </button>
                  </div>
                ) : (
                  visibleCustomers.map((c: any, idx: number) => {
                    const isHighlighted = idx === highlightCustomerIndex;
                    const isSelected = (c.uid || c.id) === selectedCustomerId;
                    return (
                      <div
                        key={c.uid || c.id || idx}
                        id={`customer-item-${idx}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedCustomerId(c.uid || c.id);
                          setCustomerDropdownOpen(false);
                          setCustomerSearch("");
                          setHighlightCustomerIndex(0);
                          const firstRow = rows[0];
                          if (firstRow) {
                            setOpenRowId(firstRow.id);
                            setSearchQuery("");
                          }
                          setTimeout(() => {
                            const row0Input = document.getElementById(`row-${rows[0]?.id || 0}-product-input`);
                            if (row0Input) row0Input.focus();
                          }, 60);
                        }}
                        className={`py-1.5 px-3 cursor-pointer transition-colors flex items-center justify-between text-xs select-none ${
                          isHighlighted
                            ? "bg-[#f5a623] text-black font-extrabold shadow-xs"
                            : isSelected
                            ? "bg-[#d8eafb] text-[#0f2942] font-bold"
                            : "hover:bg-[#ddebfa] text-[#1e293b]"
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="truncate font-bold text-xs leading-tight">
                            <HighlightMatch text={c.displayName || c.name || ""} query={customerSearch} isHighlighted={isHighlighted} />
                          </div>
                          {c.phone && (
                            <div className={`text-[10px] ${isHighlighted ? "text-black/80" : "text-slate-500"}`}>
                              <HighlightMatch text={c.phone} query={customerSearch} isHighlighted={isHighlighted} />
                            </div>
                          )}
                        </div>
                        <div className={`w-48 text-left truncate text-[11px] shrink-0 ${isHighlighted ? "text-black font-bold" : "text-slate-600"}`}>
                          <HighlightMatch text={c.businessName || c.billing_city || "—"} query={customerSearch} isHighlighted={isHighlighted} />
                        </div>
                        <div className={`w-44 text-center font-mono text-[11px] truncate shrink-0 ${isHighlighted ? "text-black font-bold" : "text-slate-600"}`}>
                          <HighlightMatch text={c.taxNumber || c.gstin || "—"} query={customerSearch} isHighlighted={isHighlighted} />
                        </div>
                        <div className={`w-32 text-right font-bold text-[11px] shrink-0 ${isHighlighted ? "text-black" : "text-slate-800"}`}>
                          {c.owesYou ? `₹${(c.owesYou / 100).toFixed(2)}` : "—"}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer shortcuts */}
              <div className="bg-[#1a4a7a] text-white py-1 px-4 text-[10px] font-mono flex items-center justify-between border-t border-[#12365a] shrink-0 select-none">
                <span>↑/↓ Navigate • ↵ Enter Select</span>
                <span>Esc Close</span>
              </div>
            </>
          ) : openRowId ? (
            (() => {
              const activeRow = rows.find((r) => r.id === openRowId);
              const isCtActive = /^ct([:\s\-\/]|$)/i.test(searchQuery.trim());
              const ctSearchParam = searchQuery.trim().replace(/^ct[:\s\-\/]?\s*/i, "").trim();
              let runningIdx = 0;

              return (
                <>
                  {/* Stock Items Header */}
                  <div className="bg-[#1a4a7a] text-white py-2 px-4 flex items-center justify-between border-b border-[#12365a] shrink-0 select-none">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black tracking-wide">Stock Items</span>
                      {selectedCategory && (
                        <span className="bg-[#f5a623] text-black text-[10px] font-black px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                          <span>{selectedCategory}</span>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedCategory(null);
                              setHighlightProductIndex(0);
                            }}
                            className="hover:bg-black/20 rounded px-0.5 ml-0.5 cursor-pointer"
                            title="Clear Category Filter"
                          >
                            ✕
                          </button>
                        </span>
                      )}
                      {isCtActive && (
                        <span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-xs flex items-center gap-1">
                          <span>ct {ctSearchParam ? `"${ctSearchParam}"` : "(All Categories)"}</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRowId(null);
                        setSelectedCategory(null);
                      }}
                      className="h-5 px-2 rounded bg-[#12365a] hover:bg-[#0c2640] text-[10px] font-bold text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>Esc</span> ✕
                    </button>
                  </div>

                  {/* Category Filter Chips Bar */}
                  {availableCategories.length > 0 && (
                    <div
                      className="bg-[#102d4b] px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto border-b border-[#0c243c] shrink-0 select-none"
                      style={{ scrollbarWidth: "none" }}
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedCategory(null);
                          setHighlightProductIndex(0);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors shrink-0 cursor-pointer ${
                          !selectedCategory
                            ? "bg-[#f5a623] text-black font-black shadow-xs"
                            : "bg-[#1a4a7a] text-blue-100 hover:bg-[#235b94]"
                        }`}
                      >
                        All ({products.length})
                      </button>
                      {availableCategories.map((cat) => {
                        const count = products.filter(
                          (p) => (p.category || "").trim().toLowerCase() === cat.toLowerCase()
                        ).length;
                        const isCatActive = selectedCategory?.toLowerCase() === cat.toLowerCase();
                        return (
                          <button
                            key={cat}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedCategory(isCatActive ? null : cat);
                              setHighlightProductIndex(0);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                              isCatActive
                                ? "bg-[#f5a623] text-black font-black shadow-xs"
                                : "bg-[#1a4a7a] text-blue-100 hover:bg-[#235b94]"
                            }`}
                          >
                            <span>{cat}</span>
                            <span className="text-[10px] opacity-75 font-normal">({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Column Subheader Bar (Exact Tally Columns) */}
                  <div className="bg-[#dbeafc] border-b border-[#bad5f5] text-[#1a3a60] text-[11px] font-bold py-1.5 px-4 flex items-center justify-between shrink-0 select-none">
                    <div className="flex-1 font-bold">Stock Item Name</div>
                    <div className="w-28 text-center shrink-0">HSN Code</div>
                    <div className="w-20 text-center shrink-0">GST Rate</div>
                    <div className="w-32 text-right pr-2 shrink-0 whitespace-nowrap">Main Location (Stock)</div>
                    <div className="w-28 text-right shrink-0">Rate / Unit</div>
                  </div>

                  {/* Product items list */}
                  <div onScroll={handleProductScroll} className="flex-1 overflow-y-auto bg-[#eef6ff]">
                    {/* End of List button when search query is empty */}
                    {!searchQuery.trim() && (
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleEndOfList(openRowId);
                        }}
                        className={`cursor-pointer py-1.5 px-4 transition-all flex items-center justify-between text-xs select-none ${
                          highlightProductIndex === -1
                            ? "bg-[#f5a623] text-black font-extrabold shadow-xs"
                            : "hover:bg-[#ddebfa] text-[#1e293b] font-bold"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs">♦</span>
                          <span>End of List</span>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            highlightProductIndex === -1 ? "bg-black text-white" : "text-slate-500"
                          }`}
                        >
                          Enter ↵
                        </span>
                      </div>
                    )}

                    {visibleProducts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 italic">
                        {selectedCategory
                          ? `No items found in category "${selectedCategory}" matching "${searchQuery}"`
                          : `No stock items match "${searchQuery}"`}
                      </div>
                    ) : (
                      visibleProducts.map((p: any) => {
                        const currentIndex = runningIdx++;
                        const isHighlighted = currentIndex === highlightProductIndex;
                        const isSelected = p.id === activeRow?.productId;
                        const uom = (p as any)?.tally_uom || (p as any)?.unit_of_measure || "N";
                        const hsn = p.hsn || p.hsn_code || (p as any)?.hsnCode || "—";
                        const gst = p.gst_rate !== undefined ? p.gst_rate : 18;
                        const stockQty =
                          p.current_stock !== undefined ? `${p.current_stock.toLocaleString()} ${uom}` : "—";
                        const rateStr = p.baseRate !== undefined ? `₹${Number(p.baseRate).toFixed(2)}` : "—";

                        return (
                          <div
                            key={p.id}
                            id={`stock-item-${currentIndex}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const prodMode = (p as any)?.tally_billing_mode || (p as any)?.tallyBillingMode || "B";
                              updateRow(openRowId, {
                                productId: p.id,
                                productName: p.name,
                                hsnCode: p.hsn_code || "",
                                billingMode: prodMode,
                                gstRate: p.gst_rate || 18,
                                manualRate: "",
                              });
                              setOpenRowId(null);
                              setSearchQuery("");
                              setHighlightProductIndex(0);
                              setTimeout(() => {
                                setActiveDescRowId(openRowId);
                              }, 60);
                            }}
                            className={`py-1.5 px-4 cursor-pointer transition-colors flex items-center justify-between text-xs select-none ${
                              isHighlighted
                                ? "bg-[#f5a623] text-black font-extrabold shadow-xs"
                                : isSelected
                                ? "bg-[#d8eafb] text-[#0f2942] font-bold"
                                : "hover:bg-[#ddebfa] text-[#1e293b]"
                            }`}
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <div className="truncate font-bold leading-tight flex items-center gap-2">
                                <span className="truncate text-xs">
                                  <HighlightMatch text={p.name || ""} query={searchQuery} isHighlighted={isHighlighted} />
                                </span>
                                {p.category && (
                                  <button
                                    type="button"
                                    title={`Click to show only "${p.category}" items`}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      const catVal = (p.category || "").trim();
                                      setSelectedCategory(
                                        selectedCategory?.toLowerCase() === catVal.toLowerCase() ? null : catVal
                                      );
                                      setHighlightProductIndex(0);
                                    }}
                                    className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded transition-colors shrink-0 ${
                                      isHighlighted
                                        ? "bg-black/20 text-black hover:bg-black/30"
                                        : selectedCategory?.toLowerCase() === (p.category || "").trim().toLowerCase()
                                        ? "bg-blue-600 text-white font-black"
                                        : "bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200"
                                    }`}
                                  >
                                    <HighlightMatch text={p.category} query={searchQuery} isHighlighted={isHighlighted} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div
                              className={`w-28 text-center font-mono text-[11px] shrink-0 ${
                                isHighlighted ? "text-black font-bold" : "text-slate-600"
                              }`}
                            >
                              <HighlightMatch text={hsn} query={searchQuery} isHighlighted={isHighlighted} />
                            </div>
                            <div
                              className={`w-20 text-center font-mono text-[11px] shrink-0 ${
                                isHighlighted ? "text-black font-bold" : "text-slate-600"
                              }`}
                            >
                              {gst}%
                            </div>
                            <div
                              className={`w-32 text-right pr-2 font-mono text-[11px] shrink-0 ${
                                isHighlighted
                                  ? "text-black font-bold"
                                  : p.current_stock < 0
                                  ? "text-red-600 font-bold"
                                  : "text-slate-700"
                              }`}
                            >
                              {stockQty}
                            </div>
                            <div
                              className={`w-28 text-right font-bold text-[11px] shrink-0 ${
                                isHighlighted ? "text-black" : "text-slate-800"
                              }`}
                            >
                              {rateStr}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Footer shortcuts */}
                  <div className="bg-[#1a4a7a] text-white py-1 px-3 text-[10px] font-mono flex items-center justify-between border-t border-[#12365a] shrink-0 select-none">
                    <span>↑/↓ Navigate • ↵ Enter Select</span>
                    <span>Esc Close</span>
                  </div>
                </>
              );
            })()
          ) : null}
        </div>
      )}

      {/* Tally Additional Description Modal */}
      {activeDescRowId && (
        <ItemDescriptionModal
          isOpen={Boolean(activeDescRowId)}
          onClose={() => setActiveDescRowId(null)}
          onBackNavigate={() => activeDescRowId && handleBackFromDescModal(activeDescRowId)}
          onSaveAndAdvance={(text) => activeDescRowId && handleSaveDescAndAdvance(activeDescRowId, text)}
          initialValue={rows.find((r) => r.id === activeDescRowId)?.description || ""}
          itemName={
            products.find((p) => p.id === rows.find((r) => r.id === activeDescRowId)?.productId)?.name ||
            rows.find((r) => r.id === activeDescRowId)?.productName ||
            "Stock Item"
          }
          title="Description for Stock Item"
        />
      )}
    </RoleGuard>
  );
}
