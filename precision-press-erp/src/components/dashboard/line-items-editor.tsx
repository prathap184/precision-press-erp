"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountPicker } from "./account-picker";

export interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
  taxRateId: string;
  inventoryItemId?: string;
  projectId?: string;
  billingMode?: 'A' | 'B';
  pcsNo?: string;
  width?: string;
  widthUnit?: 'FT' | 'IN';
  length?: string;
  lengthUnit?: 'FT' | 'IN';
  sqFt?: string;
  finishAmount?: string;
  costCenterId?: string;
  deliveryMode?: string;
  deliveryAmount?: string;
}

// Mirrors the tax-rates API row shape ({ taxRates: [...] } from GET /api/v1/tax-rates).
// `rate` is in basis points (e.g. 2000 = 20%).
interface TaxRateOption {
  id: string;
  name: string;
  rate: number;
  kind?: string;
  recoverablePercent?: number;
}

interface InventoryItemOption {
  id: string;
  name: string;
  salePrice: number;
  revenueAccountId?: string | null;
  inventoryAccountId?: string | null;
  expenseAccountId?: string | null;
  gstRate?: number | null;
  unitOfMeasure?: string | null;
  tallyBillingMode?: 'A' | 'B' | null;
  tally_billing_mode?: 'A' | 'B' | null;
  tallyUom?: string | null;
  tally_uom?: string | null;
  hasMultipleSizes?: boolean;
  has_multiple_sizes?: boolean;
  defaultWidth?: number | string | null;
  defaultLength?: number | string | null;
  default_width?: number | string | null;
  default_length?: number | string | null;
  defaultWidthUnit?: string | null;
  defaultLengthUnit?: string | null;
  default_width_unit?: string | null;
  default_length_unit?: string | null;
  defaultSizeName?: string | null;
  default_size_name?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

interface LineItemsEditorProps {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  accountTypeFilter?: string[];
  // Intent of the document, so we can surface purchase-side reclaim hints.
  taxContext?: "sales" | "purchase";
}

// Format a basis-point rate as a percentage (2000 -> "20", 1750 -> "17.5").
function formatRatePct(rate: number) {
  return (rate / 100).toFixed(rate % 100 === 0 ? 0 : 2);
}

// Whether a purchase-side rate's input VAT can be reclaimed. Rates that don't
// carry a recoverable portion (exempt/no-vat) or are explicitly partial are
// flagged so users understand what they'll actually get back.
function reclaimHint(rate: TaxRateOption): string | null {
  const kind = rate.kind || "standard";
  if (rate.rate <= 0 || kind === "exempt" || kind === "no_vat" || kind === "sales_tax_us") {
    return "not reclaimable";
  }
  const recoverable = rate.recoverablePercent ?? 10000;
  if (recoverable <= 0) return "not reclaimable";
  if (recoverable < 10000) return `${formatRatePct(recoverable)}% reclaimable`;
  return "reclaimable";
}

function SearchableProductSelect({
  value,
  inventoryItems = [],
  onSelect,
  id,
  onSelectAdvance,
  onEndOfList,
}: {
  value: string;
  inventoryItems: InventoryItemOption[];
  onSelect: (item: InventoryItemOption | null) => void;
  id?: string;
  onSelectAdvance?: () => void;
  onEndOfList?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownListRef = useRef<HTMLDivElement>(null);

  const itemsList = Array.isArray(inventoryItems) ? inventoryItems : [];
  const selectedItem = itemsList.find(
    (item) => item?.id === value || (value && (item?.metadata?.code === value || (item as any)?.code === value || item?.name?.toLowerCase() === value?.toLowerCase()))
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const qTerm = search.trim().toLowerCase();
  const matched = useMemo(() => {
    if (!qTerm) return itemsList;
    return itemsList.filter(
      (item) =>
        (item?.name && item.name.toLowerCase().includes(qTerm)) ||
        (item?.metadata?.code && String(item.metadata.code).toLowerCase().includes(qTerm)) ||
        (item?.metadata?.sku && String(item.metadata.sku).toLowerCase().includes(qTerm)) ||
        (item?.metadata?.category && String(item.metadata.category).toLowerCase().includes(qTerm))
    );
  }, [itemsList, qTerm]);

  const grouped = useMemo(() => {
    return (matched || []).reduce((acc: Record<string, InventoryItemOption[]>, item) => {
      if (!item) return acc;
      const cat = item.metadata?.category || "General Products";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }, [matched]);

  const scrollDropdownToIndex = useCallback((index: number) => {
    const list = dropdownListRef.current;
    if (!list) return;
    if (index < 0) {
      list.scrollTop = 0;
      return;
    }
    const items = list.querySelectorAll("[data-product-item='true']");
    const item = items[index] as HTMLElement | undefined;
    if (item) {
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      if (itemTop < list.scrollTop) {
        list.scrollTop = itemTop;
      } else if (itemBottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = itemBottom - list.clientHeight;
      }
    }
  }, []);

  const handleSelectItem = (p: InventoryItemOption | null) => {
    onSelect(p);
    setIsOpen(false);
    setSearch("");
    setHighlightIndex(0);
    if (onSelectAdvance) {
      onSelectAdvance();
      requestAnimationFrame(() => onSelectAdvance());
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${isOpen ? "z-[9999]" : ""}`}>
      <div className={`flex h-10 w-full items-center rounded-xl px-3 transition-all duration-150 ${
        isOpen
          ? "border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-md"
          : "border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white"
      }`}>
        <input
          id={id}
          value={isOpen ? search : (selectedItem?.name ?? "")}
          placeholder="Select item..."
          data-dropdown-open={isOpen ? "true" : "false"}
          onChange={(e) => {
            setIsOpen(true);
            setSearch(e.target.value);
            setHighlightIndex(0);
            scrollDropdownToIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearch("");
            setHighlightIndex(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!isOpen) {
                setIsOpen(true);
                setHighlightIndex(!search.trim() ? -1 : 0);
                return;
              }
              setHighlightIndex((prev) => {
                const next = Math.min(prev + 1, Math.min(matched.length - 1, 49));
                scrollDropdownToIndex(next);
                return next;
              });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIndex((prev) => {
                const next = Math.max(prev - 1, !search.trim() ? -1 : 0);
                if (next >= 0) scrollDropdownToIndex(next);
                return next;
              });
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (!isOpen) {
                // Dropdown closed — check if this row is empty (no product selected)
                if (!value && onEndOfList) {
                  // Empty row + Enter = End of List, remove this row
                  onEndOfList();
                } else if (onSelectAdvance) {
                  // Item already selected — double Enter = advance to next field
                  onSelectAdvance();
                }
              } else if (highlightIndex === -1 || matched.length === 0) {
                // END OF LIST row highlighted — close dropdown and finish item list
                setIsOpen(false);
                setSearch("");
                if (onEndOfList) {
                  onEndOfList();
                } else if (onSelectAdvance) {
                  onSelectAdvance();
                }
              } else {
                const p = matched[highlightIndex] || matched[0];
                if (p) handleSelectItem(p);
              }
            } else if (e.key === "Escape") {
              setIsOpen(false);
            }
          }}
          className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0 placeholder:text-slate-400"
        />
        <ChevronDown
          size={16}
          className={`shrink-0 ml-1 cursor-pointer transition-colors ${isOpen ? "text-blue-600" : "text-slate-400"}`}
          onClick={() => setIsOpen(!isOpen)}
        />
      </div>

      {isOpen && (
        <div
          ref={dropdownListRef}
          className="absolute left-0 top-full mt-1.5 w-[480px] sm:w-[520px] z-[99999] max-h-80 overflow-y-auto rounded-2xl border-2 border-blue-600 bg-white shadow-2xl divide-y divide-slate-100"
        >
          {/* END OF LIST row — only when no search query */}
          {!search.trim() && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsOpen(false);
                setSearch("");
                if (onEndOfList) {
                  onEndOfList();
                } else {
                  handleSelectItem(null);
                  if (onSelectAdvance) setTimeout(() => onSelectAdvance(), 60);
                }
              }}
              className={`cursor-pointer px-3.5 py-2.5 transition-all flex items-center justify-between gap-3 border-b-2 border-slate-200/80 ${
                highlightIndex === -1
                  ? 'bg-amber-500 text-white font-black shadow-inner'
                  : 'bg-amber-50 hover:bg-amber-100/80 text-amber-900 font-bold'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-black">❖</span>
                <span className="text-xs uppercase tracking-wider font-black">End of List</span>
              </div>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                highlightIndex === -1 ? 'bg-amber-700 text-white' : 'bg-amber-200/60 text-amber-800'
              }`}>
                Press Enter ↵ to finish items
              </span>
            </div>
          )}

          {matched.length === 0 ? (
            <div className="p-4 text-xs text-slate-400 italic text-center bg-white">
              No products found matching &ldquo;{search}&rdquo;.
            </div>
          ) : (
            (() => {
              let runningIdx = 0;
              return Object.entries(grouped).map(([cat, prods]) => (
                <div key={cat} className="bg-white">
                  {/* Category header with item count */}
                  <div className="bg-slate-100/95 px-3.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10 border-b border-slate-200/80 flex items-center justify-between">
                    <span>{cat.replace(/_/g, " ")}</span>
                    <span className="text-[9px] font-bold text-slate-400">{prods.length} items</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {prods.map((p) => {
                      const currentIdx = runningIdx++;
                      const isHighlighted = currentIdx === highlightIndex;
                      const isSelected = p.id === value;
                      const code = (p as any)?.metadata?.code || (p as any)?.metadata?.sku || (p as any)?.code || p.id.slice(0, 8).toUpperCase();
                      const priceVal = p.salePrice ? (p.salePrice / 100) : (p.metadata?.baseRate ? Number(p.metadata.baseRate) : null);
                      const priceStr = priceVal !== null ? `₹${priceVal.toFixed(2)}` : null;
                      const uom = String((p as any)?.unitOfMeasure || (p as any)?.tallyUom || (p as any)?.tally_uom || p?.metadata?.unit || 'N').trim().toLowerCase();
                      const uomDisplay = (uom === 'sqft' || uom === 'sq.ft' || uom === 'sqf') ? 'sq.ft' : uom;
                      const gstRate = (p as any)?.gstRate || p?.metadata?.gstRate || (p as any)?.gst_rate || 18;
                      const stock = (p as any)?.currentStock ?? (p as any)?.current_stock;

                      return (
                        <div
                          key={p.id}
                          data-product-item="true"
                          onMouseEnter={() => setHighlightIndex(currentIdx)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectItem(p);
                          }}
                          className={`cursor-pointer px-3.5 py-2.5 transition-all flex items-center justify-between gap-3 ${
                            isHighlighted
                              ? "bg-blue-600 text-white font-extrabold shadow-sm"
                              : isSelected
                                ? "bg-blue-50/90 text-blue-900 font-bold"
                                : "hover:bg-slate-50 text-slate-700 font-medium"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-bold truncate leading-tight ${isHighlighted ? "text-white" : "text-slate-900"}`}>
                              {p.name}
                            </div>
                            <div className={`text-[10px] mt-0.5 font-medium flex items-center gap-1.5 flex-wrap ${isHighlighted ? 'text-blue-100' : 'text-slate-400'}`}>
                              {priceStr && <span>{priceStr} / {uomDisplay}</span>}
                              {priceStr && <span>•</span>}
                              <span>GST {gstRate}%</span>
                              {stock !== undefined && stock !== null && (
                                <>
                                  <span>•</span>
                                  <span className={stock < 0 ? (isHighlighted ? 'text-amber-200 font-bold' : 'text-red-500 font-bold') : ''}>
                                    {Number(stock).toLocaleString()} {uomDisplay} in stock
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex-shrink-0 ${
                            isHighlighted
                              ? 'bg-blue-700 text-white'
                              : isSelected
                                ? 'bg-blue-200/80 text-blue-800'
                                : 'bg-slate-100 text-slate-500'
                          }`}>
                            {code}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      )}
    </div>
  );
}

export function LineItemsEditor({ lines, onChange, accountTypeFilter, taxContext }: LineItemsEditorProps) {
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>([]);
  const [pendingFocusRowIndex, setPendingFocusRowIndex] = useState<number | null>(null);
  const [openUnitPickerId, setOpenUnitPickerId] = useState<string | null>(null);
  const tableEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingFocusRowIndex !== null && lines.length > pendingFocusRowIndex) {
      const idx = pendingFocusRowIndex;
      setPendingFocusRowIndex(null);
      setTimeout(() => {
        const el = document.getElementById(`row-${idx}-product-input`);
        if (el) el.focus();
      }, 80);
    }
  }, [lines.length, pendingFocusRowIndex]);

  // Fetch the org's tax rates once (org via x-organization-id, mirroring the
  // bank-flow tax dropdown). Best-effort: on failure only "No tax" is offered.
  useEffect(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    fetch("/api/v1/tax-rates", { headers })
      .then((r) => r.json())
      .then((data) => { if (data.taxRates) setTaxRates(data.taxRates); })
      .catch(() => {});
      
    fetch("/api/v1/inventory?limit=2500", { headers })
      .then((r) => r.json())
      .then((data) => { if (data.data) setInventoryItems(data.data); })
      .catch(() => {});
  }, []);

  // Auto-link inventoryItemId for lines prefilled without exact inventoryItemId
  useEffect(() => {
    if (inventoryItems.length > 0 && lines.length > 0) {
      let needsUpdate = false;
      const cleanStr = (s: any) => String(s || '').trim().toLowerCase();
      const normalize = (s: any) => cleanStr(s).replace(/[^a-z0-9]/g, '');

      const updated = lines.map((line) => {
        if (!line.inventoryItemId && line.description && line.description !== "Logistics / Shipping") {
          const cleanDesc = line.description
            .replace(/\s*\([^)]*\)/g, "")
            .replace(/\s*\+.*$/, "")
            .trim();
          const cleanLower = cleanStr(cleanDesc);
          const cleanNorm = normalize(cleanDesc);

          const matched = inventoryItems.find((inv) => {
            const invName = cleanStr(inv.name);
            const invCode = cleanStr(inv.metadata?.code || (inv as any).code);
            const invSku = cleanStr(inv.metadata?.sku || (inv as any).sku);
            const invNorm = normalize(inv.name);

            if (invName === cleanLower || invCode === cleanLower || invSku === cleanLower) return true;
            if (cleanNorm && invNorm && (cleanNorm === invNorm || cleanNorm.startsWith(invNorm) || invNorm.startsWith(cleanNorm))) return true;
            if (cleanLower.length > 3 && (cleanLower.includes(invName) || invName.includes(cleanLower))) return true;
            return false;
          });

          if (matched) {
            needsUpdate = true;
            const uom = String(matched.unitOfMeasure || (matched as any).tallyUom || (matched as any).tally_uom || matched.metadata?.unit || '').trim().toLowerCase();
            const cleanUom = uom.replace(/[\s\._-]/g, '');
            const hasMultipleSizes = Boolean(
              matched.hasMultipleSizes ??
              matched.has_multiple_sizes ??
              matched.metadata?.hasMultipleSizes ??
              matched.metadata?.has_multiple_sizes ??
              (cleanUom === 'sqft' || cleanUom === 'sqf')
            );
            const defaultMode = (matched as any).tallyBillingMode || (matched as any).tally_billing_mode || matched.metadata?.tallyBillingMode || matched.metadata?.tally_billing_mode || 'B';
            const defW = hasMultipleSizes ? String(matched.metadata?.default_width ?? matched.default_width ?? matched.defaultWidth ?? '1') : '';
            const defL = hasMultipleSizes ? String(matched.metadata?.default_length ?? matched.default_length ?? matched.defaultLength ?? '1') : '';
            return {
              ...line,
              inventoryItemId: matched.id,
              billingMode: line.billingMode || defaultMode,
              width: line.width || defW,
              length: line.length || defL,
            };
          }
        }
        return line;
      });

      if (needsUpdate) {
        onChange(updated);
      }
    }
  }, [inventoryItems, lines, onChange]);

  // Auto-assign default 18% GST tax rate to sales lines if not already set
  useEffect(() => {
    if (taxRates.length > 0) {
      const defaultTax = taxRates.find(t => t.rate === 1800) || taxRates.find(t => t.name?.includes("18")) || taxRates[0];
      if (defaultTax) {
        const needsUpdate = lines.some(l => !l.taxRateId && l.description !== "Logistics / Shipping");
        if (needsUpdate) {
          const updated = lines.map(l => {
            if (!l.taxRateId && l.description !== "Logistics / Shipping") {
              return { ...l, taxRateId: defaultTax.id };
            }
            return l;
          });
          onChange(updated);
        }
      }
    }
  }, [taxRates, lines, onChange]);

  function updateLine(index: number, field: keyof LineItem, value: string) {
    const updated = lines.map((l, i) =>
      i === index ? { ...l, [field]: value } : l
    );
    onChange(updated);
  }

  function addLine() {
    const defaultTax = taxRates.find(t => t.rate === 1800) || taxRates.find(t => t.name?.includes("18")) || taxRates[0];
    onChange([
      ...lines,
      { 
        description: "", 
        quantity: "1", 
        unitPrice: "", 
        accountId: "", 
        taxRateId: defaultTax?.id || "", 
        inventoryItemId: "",
        width: "",
        widthUnit: "FT",
        length: "",
        lengthUnit: "FT",
        finishAmount: "",
        deliveryMode: "door",
        deliveryAmount: "" 
      },
    ]);
    // Scroll the new row into view after React renders it
    setTimeout(() => {
      tableEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return;
    onChange(lines.filter((_, i) => i !== index));
  }

  function lineAmount(line: LineItem) {
    const qty = parseFloat(line.quantity) || 0;
    const widthRaw = parseFloat(line.width || "0");
    const lengthRaw = parseFloat(line.length || "0");
    const width = (line.widthUnit || 'FT') === 'IN' ? widthRaw / 12 : widthRaw;
    const length = (line.lengthUnit || 'FT') === 'IN' ? lengthRaw / 12 : lengthRaw;
    const rate = parseFloat(line.unitPrice) || 0;
    const finish = parseFloat(line.finishAmount || "0");
    const delivery = parseFloat(line.deliveryAmount || "0");
    
    const itemObj = inventoryItems.find((itm) => itm.id === line.inventoryItemId);
    const rawUom = String(itemObj?.unitOfMeasure || (itemObj as any)?.tallyUom || (itemObj as any)?.tally_uom || itemObj?.metadata?.unit || '').trim().toLowerCase();
    const cleanUom = rawUom.replace(/[\s\._-]/g, '');
    const hasMultipleSizes = Boolean(
      (itemObj?.hasMultipleSizes ??
      itemObj?.has_multiple_sizes ??
      itemObj?.metadata?.hasMultipleSizes ??
      itemObj?.metadata?.has_multiple_sizes) ||
      cleanUom === 'sqft' ||
      cleanUom === 'sqf' ||
      (parseFloat(line.width || '0') > 0 && parseFloat(line.length || '0') > 0)
    );

    const isModeA = (line.billingMode || (itemObj as any)?.tallyBillingMode || (itemObj as any)?.tally_billing_mode || itemObj?.metadata?.tallyBillingMode || itemObj?.metadata?.tally_billing_mode) === 'A';
    
    if (!hasMultipleSizes) {
      // Direct piece/unit billing: Quantity * Rate per unit + finish + delivery
      return (qty * rate) + finish + delivery;
    }

    const sqFt = (width > 0 && length > 0) ? (width * length) : 0;

    if (isModeA) {
      // Mode A: Quantity is user-entered pieces; Rate per unit is (SqFt * Rate/SqFt)
      // Amount = Quantity * (SqFt * Rate/SqFt)
      const calculatedRatePerUnit = sqFt > 0 ? (sqFt * rate) : rate;
      return (qty * calculatedRatePerUnit) + finish + delivery;
    } else {
      // Mode B: Pcs is user-entered; Quantity is (SqFt * Pcs); Rate per unit is Rate/SqFt
      // Amount = (SqFt * Pcs) * Rate/SqFt
      const pcs = parseFloat(line.pcsNo || line.quantity || "1") || 1;
      const totalBilledSqft = sqFt * pcs;
      return (totalBilledSqft * rate) + finish + delivery;
    }
  }

  // Tax-EXCLUSIVE: tax is computed on top of qty*price, matching how the
  // invoice/bill routes post (taxAmount = round(amount * rateBp / 10000)).
  function lineTax(line: LineItem) {
    if (!line.taxRateId) return 0;
    const rate = taxRates.find((t) => t.id === line.taxRateId);
    if (!rate || rate.rate <= 0) return 0;
    return Math.round((lineAmount(line) * 100 * rate.rate) / 10000) / 100;
  }

  const logisticsLines = lines.filter(l => l.description === "Logistics / Shipping");
  const productLines = lines.filter(l => l.description !== "Logistics / Shipping");

  const productSubtotal = productLines.reduce((sum, l) => sum + lineAmount(l), 0);
  const logisticsTotal = logisticsLines.reduce((sum, l) => sum + lineAmount(l), 0);

  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const taxTotal = lines.reduce((sum, l) => sum + lineTax(l), 0);
  const total = subtotal + taxTotal;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="pb-2">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</div>
      </div>

      <div className="overflow-x-auto min-h-[380px]">
        <div className="min-w-[1160px] min-h-[380px] flex flex-col justify-between">
          <div>
            {/* Header Row Matching Tally & Proxy Order */}
            <div className="grid grid-cols-[32px_1.3fr_0.8fr_75px_58px_70px_70px_60px_60px_80px_75px_105px_80px_95px_32px] gap-2 border-b-2 border-slate-100 px-4 pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400 items-center">
              <span className="text-center">#</span>
              <span className="text-left pl-1">Name of Item</span>
              <span className="text-left pl-1">Project <span className="text-[9px] font-normal normal-case text-slate-400 italic">(optional)</span></span>
              <span className="text-center">GST%</span>
              <span className="text-center">T</span>
              <span className="text-center">Width</span>
              <span className="text-center">Length</span>
              <span className="text-center">Sq.Ft.</span>
              <span className="text-center">Pcs/No</span>
              <span className="text-center">Quantity</span>
              <span className="text-center">Rate/SqFt</span>
              <span className="text-center">Rate per</span>
              <span className="text-center">Finish</span>
              <span className="text-right pr-2">Amount</span>
              <span />
            </div>

            {/* Line Rows */}
            {(() => {
              let serialNo = 0;
              return lines.map((line, i) => {
              if (line.description === "Logistics / Shipping") return null;
              serialNo++;

              const selectedRate = line.taxRateId
                ? taxRates.find((t) => t.id === line.taxRateId)
                : undefined;
              const hint =
                taxContext === "purchase" && selectedRate ? reclaimHint(selectedRate) : null;

              const itemObj = inventoryItems.find((itm) => itm.id === line.inventoryItemId);
              const rawUom = String(itemObj?.unitOfMeasure || (itemObj as any)?.tallyUom || (itemObj as any)?.tally_uom || itemObj?.metadata?.unit || '').trim().toLowerCase();
              const cleanUom = rawUom.replace(/[\s\._-]/g, '');
              const hasMultipleSizes = Boolean(
                (itemObj?.hasMultipleSizes ??
                itemObj?.has_multiple_sizes ??
                itemObj?.metadata?.hasMultipleSizes ??
                itemObj?.metadata?.has_multiple_sizes) ||
                cleanUom === 'sqft' ||
                cleanUom === 'sqf' ||
                (parseFloat(line.width || '0') > 0 && parseFloat(line.length || '0') > 0)
              );
              const defaultMode = (itemObj as any)?.tallyBillingMode || (itemObj as any)?.tally_billing_mode || itemObj?.metadata?.tallyBillingMode || itemObj?.metadata?.tally_billing_mode || 'B';
              const currentMode = line.billingMode || defaultMode;
              const isModeA = currentMode === 'A';
              const isModeB = currentMode === 'B';

              // Convert inches to feet for sq.ft calculation
              const widthRaw = parseFloat(line.width || "0");
              const lengthRaw = parseFloat(line.length || "0");
              const widthFt = (line.widthUnit || 'FT') === 'IN' ? widthRaw / 12 : widthRaw;
              const lengthFt = (line.lengthUnit || 'FT') === 'IN' ? lengthRaw / 12 : lengthRaw;
              const widthNum = widthFt;
              const lengthNum = lengthFt;
              const pcs = Math.max(1, parseFloat(line.pcsNo || line.quantity || "1") || 1);
              const sqFtNum = hasMultipleSizes && widthNum > 0 && lengthNum > 0 ? (widthNum * lengthNum) : 0;
              const calculatedSqFt = sqFtNum > 0 ? sqFtNum.toFixed(2) : "—";
              const totalBilledSqft = sqFtNum * pcs;
              const rateNum = parseFloat(line.unitPrice) || 0;
              const calculatedRatePerUnit = isModeA ? (sqFtNum > 0 ? sqFtNum * rateNum : rateNum) : rateNum;

              return (
                <div
                  key={i}
                  style={{ zIndex: Math.max(1, 60 - i) }}
                  className="grid grid-cols-[32px_1.3fr_0.8fr_75px_58px_70px_70px_60px_60px_80px_75px_105px_80px_95px_32px] gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 items-center hover:bg-slate-50/50 transition-colors relative"
                >
                {/* Serial # */}
                <div className="text-center font-bold text-xs text-slate-400">
                  {serialNo}
                </div>

                {/* Name of Item */}
                <div className="space-y-1.5 min-w-0">
                  {inventoryItems.length > 0 && (
                    <SearchableProductSelect
                      id={`row-${i}-product-input`}
                      value={line.inventoryItemId || ""}
                      inventoryItems={inventoryItems}
                      onSelectAdvance={() => {
                        if (hasMultipleSizes) {
                          const wInput = document.getElementById(`row-${i}-width`);
                          if (wInput) wInput.focus();
                        } else {
                          const qInput = document.getElementById(`row-${i}-quantity`);
                          if (qInput) qInput.focus();
                        }
                      }}
                      onEndOfList={() => {
                        // End of list selected — delete this empty line and advance to next section
                        if (lines.length > 1) {
                          removeLine(i);
                        } else {
                          updateLine(0, "inventoryItemId", "");
                          updateLine(0, "description", "");
                        }

                        // Focus the next section outside the items table (Logistics Pickup Tab)
                        setTimeout(() => {
                          const nextTarget =
                            document.getElementById("logistics-tab-pickup") ||
                            document.getElementById("logistics-tab-door") ||
                            document.getElementById("logistics-delivery-input") ||
                            document.querySelector('input[placeholder*="Delivery address"]') ||
                            document.getElementById("invoice-notes-input") ||
                            document.getElementById("invoice-reference-input") ||
                            document.querySelector('button[type="submit"]');
                          if (nextTarget) {
                            (nextTarget as HTMLElement).focus();
                          }
                        }, 50);
                      }}
                      onSelect={(item) => {
                        if (!item) {
                          updateLine(i, "inventoryItemId", "");
                          return;
                        }
                        const gstVal = item.gstRate ?? item.metadata?.gstRate ?? item.metadata?.gst_rate ?? 18;
                        const targetBp = gstVal <= 1 ? Math.round(gstVal * 10000) : (gstVal <= 100 ? Math.round(gstVal * 100) : gstVal);
                        const matchingTax = taxRates.find(t => t.rate === targetBp || Math.round(t.rate / 100) === Math.round(gstVal)) 
                          || taxRates.find(t => t.rate === 1800) 
                          || (taxRates.length > 0 ? taxRates[0] : null);

                        const itemRawUom = String(item.unitOfMeasure || (item as any).tallyUom || (item as any).tally_uom || item.metadata?.unit || '').trim().toLowerCase();
                        const itemCleanUom = itemRawUom.replace(/[\s\._-]/g, '');
                        const itemHasSizes = Boolean(
                          (item.hasMultipleSizes ??
                          item.has_multiple_sizes ??
                          item.metadata?.hasMultipleSizes ??
                          item.metadata?.has_multiple_sizes) ||
                          itemCleanUom === 'sqft' ||
                          itemCleanUom === 'sqf'
                        );
                        const itemDefaultMode = (item as any).tallyBillingMode || (item as any).tally_billing_mode || item.metadata?.tallyBillingMode || item.metadata?.tally_billing_mode || 'B';
                        const effectiveRate = !itemHasSizes
                          ? (Number(item.salePrice || 0) / 100)
                          : (item.metadata?.baseRate != null ? Number(item.metadata.baseRate) : (Number(item.salePrice || 0) / 100));
                        
                        const defW = itemHasSizes ? String(item.default_width ?? item.defaultWidth ?? item.metadata?.default_width ?? item.metadata?.defaultWidth ?? '1') : '';
                        const defL = itemHasSizes ? String(item.default_length ?? item.defaultLength ?? item.metadata?.default_length ?? item.metadata?.defaultLength ?? '1') : '';

                        const updated = [...lines];
                        updated[i] = {
                          ...updated[i],
                          inventoryItemId: item.id,
                          description: item.name,
                          unitPrice: effectiveRate.toString(),
                          billingMode: itemDefaultMode,
                          pcsNo: "1",
                          width: defW,
                          length: defL,
                          accountId: (taxContext === "purchase" ? item.expenseAccountId : item.revenueAccountId) || updated[i].accountId,
                          taxRateId: matchingTax ? matchingTax.id : (taxRates.find(t => t.rate === 1800)?.id || updated[i].taxRateId),
                        };
                        onChange(updated);
                      }}
                    />
                  )}
                  <Input
                    className="h-7 text-xs bg-slate-50/70 border-slate-200 rounded-lg placeholder:text-slate-400"
                    value={line.description}
                    onChange={(e) => updateLine(i, "description", e.target.value)}
                    placeholder="Custom description / item notes..."
                  />
                  <div className="hidden">
                    <AccountPicker
                      value={line.accountId}
                      onChange={(v) => updateLine(i, "accountId", v)}
                      typeFilter={accountTypeFilter}
                      placeholder="Account"
                    />
                  </div>
                </div>

                {/* Project */}
                <div>
                  <Input
                    className="h-9 text-xs bg-slate-50 border-slate-200 rounded-xl focus:bg-white transition-all font-medium placeholder:text-slate-400"
                    value={line.projectId || ""}
                    onChange={(e) => updateLine(i, "projectId", e.target.value)}
                    placeholder="Project name"
                  />
                </div>

                {/* GST% Selector */}
                <div>
                  <Select
                    value={line.taxRateId || (taxRates.find(t => t.rate === 1800)?.id || "none")}
                    onValueChange={(v) => updateLine(i, "taxRateId", v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="h-9 text-xs font-bold bg-slate-50 border-slate-200 rounded-xl">
                      <SelectValue placeholder="0%" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 shadow-xl z-[9999]">
                      <SelectItem value="none">0%</SelectItem>
                      {taxRates.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="font-semibold">
                          {formatRatePct(t.rate)}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mode (T) Locked Badge */}
                <div className="text-center">
                  {!hasMultipleSizes ? (
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-black border ${
                      currentMode === 'A'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    }`}>
                      {currentMode || 'A'}
                    </span>
                  ) : (
                    <span
                      title={`Mode ${currentMode} — Locked to Tally master`}
                      className={`h-8 min-w-[50px] px-1.5 rounded-lg border-2 font-black text-xs inline-flex items-center justify-center gap-1 shadow-sm select-none cursor-default ${
                        currentMode === 'A'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-emerald-600 bg-emerald-600 text-white'
                      }`}
                    >
                      <span className="text-xs font-extrabold">{currentMode}</span>
                      <span className="text-[8px] font-bold opacity-90">{currentMode === 'A' ? 'Pcs' : 'SqFt'}</span>
                    </span>
                  )}
                </div>

                {/* Width */}
                <div>
                  {!hasMultipleSizes ? (
                    <div className="h-9 flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-xl font-bold">—</div>
                  ) : (
                    <div className="flex h-9 items-center rounded-xl border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white px-1 overflow-visible transition-all">
                      <input
                        id={`row-${i}-width`}
                        className="w-full border-0 bg-transparent p-0 text-center text-xs font-bold font-mono text-slate-800 outline-none focus:ring-0"
                        type="number"
                        value={line.width || ""}
                        onChange={(e) => updateLine(i, "width", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const unitBtn = document.getElementById(`row-${i}-width-unit`);
                            if (unitBtn) unitBtn.focus();
                            else { const nextEl = document.getElementById(`row-${i}-length`); if (nextEl) nextEl.focus(); }
                          }
                        }}
                        placeholder="W"
                      />
                      <div className="relative flex-shrink-0">
                        <button
                          id={`row-${i}-width-unit`}
                          type="button"
                          onClick={() => setOpenUnitPickerId(openUnitPickerId === `${i}-w` ? null : `${i}-w`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setOpenUnitPickerId(null);
                              const nextEl = document.getElementById(`row-${i}-length`);
                              if (nextEl) nextEl.focus();
                            } else if (e.key === " " || e.key === "Spacebar") {
                              e.preventDefault();
                              const updated = [...lines];
                              updated[i] = { ...updated[i], widthUnit: (line.widthUnit === 'FT' ? 'IN' : 'FT') };
                              onChange(updated);
                            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                              e.preventDefault();
                              const updated = [...lines];
                              updated[i] = { ...updated[i], widthUnit: (line.widthUnit === 'FT' ? 'IN' : 'FT') };
                              onChange(updated);
                            }
                          }}
                          onBlur={() => setTimeout(() => setOpenUnitPickerId(null), 150)}
                          className="flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                          {(line.widthUnit || 'FT') === 'FT' ? 'ft' : 'in'}
                          <svg className="w-2.5 h-2.5 text-blue-500" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
                        </button>
                        {openUnitPickerId === `${i}-w` && (
                          <div className="absolute right-0 top-full mt-1 z-[9999] w-14 rounded-xl border-2 border-blue-600 bg-white shadow-2xl overflow-hidden">
                            {(['FT', 'IN'] as const).map(u => (
                              <button
                                key={u}
                                type="button"
                                tabIndex={-1}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const updated = [...lines];
                                  updated[i] = { ...updated[i], widthUnit: u };
                                  onChange(updated);
                                  setOpenUnitPickerId(null);
                                  setTimeout(() => { const el = document.getElementById(`row-${i}-length`); if (el) el.focus(); }, 50);
                                }}
                                className={`w-full text-center py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${(line.widthUnit || 'FT') === u ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                              >
                                {u.toLowerCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Length */}
                <div>
                  {!hasMultipleSizes ? (
                    <div className="h-9 flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-xl font-bold">—</div>
                  ) : (
                    <div className="flex h-9 items-center rounded-xl border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white px-1 overflow-visible transition-all">
                      <input
                        id={`row-${i}-length`}
                        className="w-full border-0 bg-transparent p-0 text-center text-xs font-bold font-mono text-slate-800 outline-none focus:ring-0"
                        type="number"
                        value={line.length || ""}
                        onChange={(e) => updateLine(i, "length", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const unitBtn = document.getElementById(`row-${i}-length-unit`);
                            if (unitBtn) unitBtn.focus();
                            else if (isModeB) { const el = document.getElementById(`row-${i}-pcs`); if (el) el.focus(); }
                            else { const el = document.getElementById(`row-${i}-quantity`); if (el) el.focus(); }
                          }
                        }}
                        placeholder="L"
                      />
                      <div className="relative flex-shrink-0">
                        <button
                          id={`row-${i}-length-unit`}
                          type="button"
                          onClick={() => setOpenUnitPickerId(openUnitPickerId === `${i}-l` ? null : `${i}-l`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setOpenUnitPickerId(null);
                              if (isModeB) { const el = document.getElementById(`row-${i}-pcs`); if (el) el.focus(); }
                              else { const el = document.getElementById(`row-${i}-quantity`); if (el) el.focus(); }
                            } else if (e.key === " " || e.key === "Spacebar") {
                              e.preventDefault();
                              const updated = [...lines];
                              updated[i] = { ...updated[i], lengthUnit: (line.lengthUnit === 'FT' ? 'IN' : 'FT') };
                              onChange(updated);
                            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                              e.preventDefault();
                              const updated = [...lines];
                              updated[i] = { ...updated[i], lengthUnit: (line.lengthUnit === 'FT' ? 'IN' : 'FT') };
                              onChange(updated);
                            }
                          }}
                          onBlur={() => setTimeout(() => setOpenUnitPickerId(null), 150)}
                          className="flex items-center gap-0.5 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700 hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                          {(line.lengthUnit || 'FT') === 'FT' ? 'ft' : 'in'}
                          <svg className="w-2.5 h-2.5 text-blue-500" viewBox="0 0 10 10" fill="currentColor"><path d="M5 7L1 3h8z"/></svg>
                        </button>
                        {openUnitPickerId === `${i}-l` && (
                          <div className="absolute right-0 top-full mt-1 z-[9999] w-14 rounded-xl border-2 border-blue-600 bg-white shadow-2xl overflow-hidden">
                            {(['FT', 'IN'] as const).map(u => (
                              <button
                                key={u}
                                type="button"
                                tabIndex={-1}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const updated = [...lines];
                                  updated[i] = { ...updated[i], lengthUnit: u };
                                  onChange(updated);
                                  setOpenUnitPickerId(null);
                                  setTimeout(() => {
                                    if (isModeB) { const el = document.getElementById(`row-${i}-pcs`); if (el) el.focus(); }
                                    else { const el = document.getElementById(`row-${i}-quantity`); if (el) el.focus(); }
                                  }, 50);
                                }}
                                className={`w-full text-center py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${(line.lengthUnit || 'FT') === u ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                              >
                                {u.toLowerCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sq.Ft. Readout */}
                <div className="text-center font-mono font-bold text-xs text-slate-600 bg-slate-100/80 py-2 rounded-xl border border-slate-200/50">
                  {calculatedSqFt}
                </div>

                {/* Pcs/No Column — Only in Mode B with Multiple Sizes */}
                <div className="text-center">
                  {hasMultipleSizes && isModeB ? (
                    <Input
                      id={`row-${i}-pcs`}
                      className="h-9 text-center text-xs font-black font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                      type="number"
                      min="1"
                      value={line.pcsNo ?? line.quantity ?? '1'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = [...lines];
                        updated[i] = { ...updated[i], pcsNo: val, quantity: val };
                        onChange(updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const nextEl = document.getElementById(`row-${i}-unitPrice`);
                          if (nextEl) nextEl.focus();
                        }
                      }}
                      placeholder="Pcs"
                    />
                  ) : (
                    <span className="text-slate-300 font-bold">—</span>
                  )}
                </div>

                {/* Quantity Column */}
                <div className="text-center text-xs font-bold tabular-nums">
                  {!hasMultipleSizes ? (
                    <div className="inline-flex items-center justify-center">
                      <Input
                        id={`row-${i}-quantity`}
                        className="h-9 w-14 text-center text-xs font-black font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                        type="number"
                        min="1"
                        value={line.quantity || '1'}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = [...lines];
                          updated[i] = { ...updated[i], quantity: val, pcsNo: val };
                          onChange(updated);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const nextEl = document.getElementById(`row-${i}-unitPrice`);
                            if (nextEl) nextEl.focus();
                          }
                        }}
                      />
                      <span className="ml-1 text-[10px] font-black text-slate-500">{rawUom ? rawUom.toUpperCase() : 'N'}</span>
                    </div>
                  ) : isModeB ? (
                    <span className="text-slate-800 font-bold">{totalBilledSqft > 0 ? `${totalBilledSqft.toFixed(3)} sqft` : '—'}</span>
                  ) : (
                    <div className="inline-flex items-center justify-center">
                      <Input
                        id={`row-${i}-quantity`}
                        className="h-9 w-14 text-center text-xs font-black font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                        type="number"
                        min="1"
                        value={line.quantity || '1'}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = [...lines];
                          updated[i] = { ...updated[i], quantity: val, pcsNo: val };
                          onChange(updated);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const nextEl = document.getElementById(`row-${i}-unitPrice`);
                            if (nextEl) nextEl.focus();
                          }
                        }}
                      />
                      <span className="ml-1 text-[10px] font-black text-slate-500">N</span>
                    </div>
                  )}
                </div>

                {/* Rate/SqFt Column — EDITABLE in Mode A with Multiple Sizes; BLANK in Mode B */}
                <div className="text-center text-xs font-bold text-slate-700 tabular-nums">
                  {hasMultipleSizes && isModeA ? (
                    <CurrencyInput
                      id={`row-${i}-unitPrice`}
                      size="sm"
                      className="h-9 text-right text-xs font-bold font-mono bg-blue-50 border-blue-300 text-blue-800 rounded-xl focus:border-blue-600 focus:bg-white"
                      value={line.unitPrice}
                      onChange={(v) => updateLine(i, "unitPrice", v)}
                      onKeyDown={(e: any) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (i === lines.length - 1) {
                            setPendingFocusRowIndex(lines.length);
                            addLine();
                          } else {
                            const nextEl = document.getElementById(`row-${i + 1}-product-input`);
                            if (nextEl) nextEl.focus();
                          }
                        }
                      }}
                      placeholder="0.00"
                    />
                  ) : (
                    <span className="text-slate-300 font-bold">—</span>
                  )}
                </div>

                {/* Rate per Column — Shows calculated (Sq.Ft * Rate/SqFt) in Mode A; EDITABLE in Mode B & Direct */}
                <div className="text-center text-xs font-bold tabular-nums">
                  {hasMultipleSizes && isModeA ? (
                    <span className="inline-flex items-center gap-1 text-blue-900 font-bold text-xs bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                      {calculatedRatePerUnit.toFixed(2)}
                      <span className="text-[10px] text-blue-500 font-bold">N</span>
                    </span>
                  ) : hasMultipleSizes && isModeB ? (
                    <div className="inline-flex items-center gap-1">
                      <input
                        id={`row-${i}-unitPrice`}
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-9 w-20 text-right text-xs font-bold font-mono bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl px-1.5 focus:outline-none focus:border-emerald-600 focus:bg-white"
                        value={rateNum > 0 ? rateNum : ''}
                        onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (i === lines.length - 1) {
                              setPendingFocusRowIndex(lines.length);
                              addLine();
                            } else {
                              const nextEl = document.getElementById(`row-${i + 1}-product-input`);
                              if (nextEl) nextEl.focus();
                            }
                          }
                        }}
                        placeholder="0.00"
                      />
                      <span className="text-[10px] font-black text-emerald-600">
                        sqft
                      </span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1">
                      <input
                        id={`row-${i}-unitPrice`}
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-9 w-20 text-right text-xs font-bold font-mono bg-slate-50 border border-slate-300 text-slate-800 rounded-xl px-1.5 focus:outline-none focus:border-blue-600 focus:bg-white"
                        value={rateNum > 0 ? rateNum : ''}
                        onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (i === lines.length - 1) {
                              setPendingFocusRowIndex(lines.length);
                              addLine();
                            } else {
                              const nextEl = document.getElementById(`row-${i + 1}-product-input`);
                              if (nextEl) nextEl.focus();
                            }
                          }
                        }}
                        placeholder="0.00"
                      />
                      <span className="text-[10px] font-black text-slate-500">
                        {rawUom ? rawUom.toUpperCase() : 'N'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Finish */}
                <div>
                  {!hasMultipleSizes ? (
                    <div className="h-9 flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-xl font-bold">—</div>
                  ) : (
                    <CurrencyInput
                      size="sm"
                      placeholder="0.00"
                      className="h-9 text-right text-xs font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                      value={line.finishAmount || ""}
                      onChange={(v) => updateLine(i, "finishAmount", v)}
                    />
                  )}
                </div>

                {/* Row Total Amount */}
                <div className="text-right font-mono font-black text-xs text-slate-900 pr-1">
                  ₹{lineAmount(line).toFixed(2)}
                </div>

                {/* Delete Row Button */}
                <div className="text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    onClick={() => removeLine(i)}
                    disabled={lines.length <= 1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          });
          })()}
          </div>

          {/* Scroll anchor — new rows scroll here */}
          <div ref={tableEndRef} />

          {/* Add Line & Summary Footer (Vertical Pricing Breakdown matching Image 2) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/80 p-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="bg-white hover:bg-slate-50 border-slate-200 text-slate-800 font-bold text-xs rounded-xl shadow-xs gap-1.5 h-10 px-5"
            >
              <Plus className="size-4 text-blue-600" />
              <span>Add Another Item</span>
            </Button>

            {/* Vertical Pricing Breakdown exactly as Image 2 & 5 */}
            <div className="w-full sm:w-72 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-2 text-xs font-medium">
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-bold text-slate-700">Subtotal</span>
                <span className="font-mono font-bold text-slate-900">{productSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span className="font-bold text-slate-700">Tax</span>
                <span className="font-mono font-bold text-slate-900">{taxTotal.toFixed(2)}</span>
              </div>
              {taxTotal > 0 && (
                <>
                  <div className="flex justify-between items-center text-slate-500 pl-2 text-[11px]">
                    <span className="font-bold text-slate-700">CGST Breakdown</span>
                    <span className="font-mono font-bold text-slate-900">{(taxTotal / 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500 pl-2 text-[11px]">
                    <span className="font-bold text-slate-700">SGST Breakdown</span>
                    <span className="font-mono font-bold text-slate-900">{(taxTotal / 2).toFixed(2)}</span>
                  </div>
                </>
              )}
              {logisticsTotal > 0 && (
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-bold text-slate-700">Logistics</span>
                  <span className="font-mono font-bold text-slate-900">{logisticsTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-slate-200/80 pt-2 text-sm">
                <span className="font-black text-slate-900">Total</span>
                <span className="font-mono font-black text-slate-950 text-base">₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
