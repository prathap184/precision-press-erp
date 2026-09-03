"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Plus, Trash2, Search, ChevronDown, Check } from "lucide-react";
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
  length?: string;
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
}: {
  value: string;
  inventoryItems: InventoryItemOption[];
  onSelect: (item: InventoryItemOption | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const itemsList = Array.isArray(inventoryItems) ? inventoryItems : [];
  const selectedItem = itemsList.find((item) => item?.id === value);

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

  return (
    <div ref={containerRef} className="relative w-full">
      <div className={`flex h-10 w-full items-center rounded-xl px-3 transition-all duration-150 ${
        isOpen
          ? "border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-md"
          : "border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white"
      }`}>
        <input
          value={isOpen ? search : (selectedItem?.name ?? "")}
          placeholder="Select item..."
          data-dropdown-open={isOpen ? "true" : "false"}
          onChange={(e) => {
            setIsOpen(true);
            setSearch(e.target.value);
            setHighlightIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearch("");
            setHighlightIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!isOpen) {
                setIsOpen(true);
                setHighlightIndex(0);
                return;
              }
              setHighlightIndex((prev) => Math.min(prev + 1, Math.min(matched.length - 1, 49)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === "Enter") {
              if (isOpen && matched.length > 0) {
                e.preventDefault();
                const p = matched[highlightIndex] || matched[0];
                if (p) {
                  onSelect(p);
                  setIsOpen(false);
                  setSearch("");
                  setHighlightIndex(0);
                }
              }
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
        <div className="absolute left-0 top-full mt-2 w-[480px] sm:w-[560px] z-[99999] max-h-80 overflow-y-auto rounded-2xl border-2 border-blue-600 bg-white shadow-2xl divide-y divide-slate-100">
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(null);
              setIsOpen(false);
              setSearch("");
              setHighlightIndex(0);
            }}
            className="cursor-pointer p-3 px-4 bg-slate-50/80 hover:bg-slate-100 text-xs font-bold text-slate-500 italic flex justify-between items-center transition-colors border-b border-slate-100"
          >
            <span>✍️ Custom item (no inventory catalog link)</span>
            {!value && <Check className="size-4 text-blue-600 shrink-0" />}
          </div>

          {matched.length === 0 ? (
            <div className="p-4 text-xs text-slate-400 italic text-center bg-white">
              No products found matching &ldquo;{search}&rdquo;.
            </div>
          ) : (
            (() => {
              let runningIdx = 0;
              return Object.entries(grouped).map(([cat, prods]) => (
                <div key={cat} className="bg-white">
                  <div className="bg-slate-100/90 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10 border-b border-slate-200/80 shadow-xs">
                    {cat.replace(/_/g, " ")}
                  </div>
                  {prods.map((p) => {
                    const currentIdx = runningIdx++;
                    const isHighlighted = currentIdx === highlightIndex;
                    const isSelected = p.id === value;
                    const code = p.metadata?.code || p.metadata?.sku || p.id.slice(0, 8);
                    const price = p.salePrice ? (p.salePrice / 100).toFixed(2) : (p.metadata?.baseRate ? Number(p.metadata.baseRate).toFixed(2) : null);

                    return (
                      <div
                        key={p.id}
                        ref={(el) => {
                          if (el && isHighlighted) {
                            el.scrollIntoView({ block: "nearest" });
                          }
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelect(p);
                          setIsOpen(false);
                          setSearch("");
                          setHighlightIndex(0);
                        }}
                        className={`cursor-pointer border-b border-slate-100 p-3 px-4 flex justify-between items-center transition-colors ${
                          isHighlighted
                            ? "bg-blue-600 text-white font-extrabold shadow-sm"
                            : isSelected
                              ? "bg-blue-50 text-blue-800 font-extrabold"
                              : "hover:bg-slate-50 text-slate-800"
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <div className={`text-xs font-bold truncate ${isHighlighted ? "text-white" : "text-slate-900"}`}>
                            {p.name}
                          </div>
                          {price && (
                            <div className={`text-[11px] font-mono mt-0.5 ${isHighlighted ? "text-blue-100" : "text-slate-500"}`}>
                              Base Rate: ₹{price}
                            </div>
                          )}
                        </div>
                        {code && (
                          <span className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-lg shrink-0 uppercase border ${
                            isHighlighted
                              ? "bg-blue-700 text-white border-blue-500"
                              : "text-slate-600 bg-slate-100 border-slate-200"
                          }`}>
                            {code}
                          </span>
                        )}
                      </div>
                    );
                  })}
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
      
    fetch("/api/v1/inventory?limit=1000", { headers })
      .then((r) => r.json())
      .then((data) => { if (data.data) setInventoryItems(data.data); })
      .catch(() => {});
  }, []);

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
  }, [taxRates, lines]);

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
        length: "",
        finishAmount: "",
        deliveryMode: "door",
        deliveryAmount: "" 
      },
    ]);
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return;
    onChange(lines.filter((_, i) => i !== index));
  }

  function lineAmount(line: LineItem) {
    const qty = parseFloat(line.quantity) || 0;
    const width = parseFloat(line.width || "0");
    const length = parseFloat(line.length || "0");
    const rate = parseFloat(line.unitPrice) || 0;
    const finish = parseFloat(line.finishAmount || "0");
    const delivery = parseFloat(line.deliveryAmount || "0");
    
    const sqFt = (width > 0 && length > 0) ? width * length : 1;
    return (sqFt * qty * rate) + finish + delivery;
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
      {/* Top Header with Add Row button matching Proxy Order */}
      <div className="flex items-center justify-between pb-2">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</div>
        <button
          type="button"
          onClick={addLine}
          className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
        >
          <Plus size={12} /> Add Row
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1050px]">
          {/* Header Row Matching Tally & Proxy Order */}
          <div className="grid grid-cols-[32px_1.7fr_1.1fr_75px_58px_70px_70px_60px_60px_80px_75px_85px_80px_95px_32px] gap-2 border-b-2 border-slate-100 pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span className="text-center">#</span>
            <span>Name of Item</span>
            <span>Project <span className="text-[9px] font-normal normal-case text-slate-400 italic">(optional)</span></span>
            <span className="text-center">GST%</span>
            <span className="text-center">T</span>
            <span className="text-center">Width</span>
            <span className="text-center">Length</span>
            <span className="text-center">Sq.Ft.</span>
            <span className="text-center">Pcs/No</span>
            <span className="text-center">Quantity</span>
            <span className="text-center">Rate/SqFt</span>
            <span className="text-center">Rate per</span>
            <span className="text-right">Finish</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {/* Line Rows */}
          {lines.map((line, i) => {
            if (line.description === "Logistics / Shipping") return null;

            const selectedRate = line.taxRateId
              ? taxRates.find((t) => t.id === line.taxRateId)
              : undefined;
            const hint =
              taxContext === "purchase" && selectedRate ? reclaimHint(selectedRate) : null;

            const itemMetadata = inventoryItems.find((itm) => itm.id === line.inventoryItemId)?.metadata;
            const isDirectSelling = itemMetadata?.isDirectSelling === true;
            const currentMode = isDirectSelling ? 'B' : (line.billingMode || 'A');
            const widthNum = parseFloat(line.width || "0");
            const lengthNum = parseFloat(line.length || "0");
            const pcs = Math.max(1, parseFloat(line.pcsNo || line.quantity || "1") || 1);
            const sqFtNum = (widthNum > 0 && lengthNum > 0) ? (widthNum * lengthNum) : 0;
            const calculatedSqFt = sqFtNum > 0 ? sqFtNum.toFixed(2) : "--";
            const totalBilledSqft = sqFtNum * pcs;
            const rateNum = parseFloat(line.unitPrice) || 0;

            return (
              <div
                key={i}
                className="grid grid-cols-[32px_1.7fr_1.1fr_75px_58px_70px_70px_60px_60px_80px_75px_85px_80px_95px_32px] gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 items-center hover:bg-slate-50/50 transition-colors"
              >
                {/* Index # */}
                <div className="text-center font-bold text-xs text-slate-400">
                  {i + 1}
                </div>

                {/* Name of Item */}
                <div className="space-y-1.5 min-w-0">
                  {inventoryItems.length > 0 && (
                    <SearchableProductSelect
                      value={line.inventoryItemId || ""}
                      inventoryItems={inventoryItems}
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

                        const isItemDirectSelling = item.metadata?.isDirectSelling === true;
                        const effectiveRate = isItemDirectSelling
                          ? (Number(item.salePrice || 0) / 100)
                          : (item.metadata?.baseRate != null ? Number(item.metadata.baseRate) : (Number(item.salePrice || 0) / 100));
                        const updated = [...lines];
                        updated[i] = {
                          ...updated[i],
                          inventoryItemId: item.id,
                          description: item.name,
                          unitPrice: effectiveRate.toString(),
                          billingMode: isItemDirectSelling ? "B" : "A",
                          pcsNo: "1",
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
                      <SelectItem value="none">0% No Tax</SelectItem>
                      {taxRates.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="font-semibold">
                          {formatRatePct(t.rate)}% ({t.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mode (T) Toggle Button */}
                <div className="text-center">
                  {isDirectSelling ? (
                    <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-black">
                      B
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const nextMode = currentMode === 'A' ? 'B' : 'A';
                        updateLine(i, "billingMode", nextMode);
                      }}
                      title="Click to toggle Mode A (Pieces) or Mode B (Sq.Ft)"
                      className={`h-8 min-w-[50px] px-1.5 rounded-lg border-2 font-black text-xs transition-all inline-flex items-center justify-center gap-1 shadow-sm cursor-pointer ${
                        currentMode === 'A'
                          ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-500/20'
                          : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/20'
                      }`}
                    >
                      <span className="text-xs font-extrabold">{currentMode}</span>
                      <span className="text-[8px] font-bold opacity-90">{currentMode === 'A' ? 'Pcs' : 'SqFt'}</span>
                    </button>
                  )}
                </div>

                {/* Width */}
                <div>
                  {isDirectSelling ? (
                    <div className="h-9 flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-xl font-bold">—</div>
                  ) : (
                    <div className="relative">
                      <Input
                        className="h-9 text-center text-xs font-bold font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white pr-4"
                        type="number"
                        value={line.width || ""}
                        onChange={(e) => updateLine(i, "width", e.target.value)}
                        placeholder="W"
                      />
                      <span className="absolute right-1.5 top-2.5 text-[9px] font-bold text-slate-400 pointer-events-none">ft</span>
                    </div>
                  )}
                </div>

                {/* Length */}
                <div>
                  {isDirectSelling ? (
                    <div className="h-9 flex items-center justify-center text-xs text-slate-400 bg-slate-100 rounded-xl font-bold">—</div>
                  ) : (
                    <div className="relative">
                      <Input
                        className="h-9 text-center text-xs font-bold font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white pr-4"
                        type="number"
                        value={line.length || ""}
                        onChange={(e) => updateLine(i, "length", e.target.value)}
                        placeholder="L"
                      />
                      <span className="absolute right-1.5 top-2.5 text-[9px] font-bold text-slate-400 pointer-events-none">ft</span>
                    </div>
                  )}
                </div>

                {/* Sq.Ft. Readout */}
                <div className="text-center font-mono font-bold text-xs text-slate-600 bg-slate-100/80 py-2 rounded-xl border border-slate-200/50">
                  {calculatedSqFt}
                </div>

                {/* Pcs/No Column */}
                <div className="text-center">
                  {currentMode === 'B' ? (
                    <Input
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
                      placeholder="Pcs"
                    />
                  ) : (
                    <span className="text-slate-300 font-bold">—</span>
                  )}
                </div>

                {/* Quantity Column */}
                <div className="text-center text-xs font-bold tabular-nums">
                  {isDirectSelling ? (
                    <span className="text-slate-700 font-bold">{pcs} N</span>
                  ) : currentMode === 'B' ? (
                    <span className="text-slate-800 font-bold">{totalBilledSqft > 0 ? `${totalBilledSqft.toFixed(3)} sqft` : '—'}</span>
                  ) : (
                    <div className="inline-flex items-center justify-center">
                      <Input
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
                      />
                      <span className="ml-1 text-[10px] font-black text-slate-500">N</span>
                    </div>
                  )}
                </div>

                {/* Rate/SqFt Column */}
                <div className="text-center text-xs font-bold text-slate-700 tabular-nums">
                  {currentMode === 'A' ? (
                    <CurrencyInput
                      size="sm"
                      className="h-9 text-right text-xs font-bold font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                      value={line.unitPrice}
                      onChange={(v) => updateLine(i, "unitPrice", v)}
                    />
                  ) : (
                    '—'
                  )}
                </div>

                {/* Rate per Column */}
                <div className="text-center text-xs font-bold tabular-nums">
                  {isDirectSelling ? (
                    `${rateNum.toFixed(2)} N`
                  ) : currentMode === 'B' ? (
                    <CurrencyInput
                      size="sm"
                      className="h-9 text-right text-xs font-bold font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                      value={line.unitPrice}
                      onChange={(v) => updateLine(i, "unitPrice", v)}
                    />
                  ) : (
                    <span className="text-blue-700 font-bold">{(sqFtNum * rateNum).toFixed(2)} N</span>
                  )}
                </div>

                {/* Finish */}
                <div>
                  {isDirectSelling ? (
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
          })}

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
