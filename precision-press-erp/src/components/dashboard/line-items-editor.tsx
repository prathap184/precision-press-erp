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
      <div className="flex h-8 w-full items-center rounded-md border border-input bg-background px-2.5 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring focus-within:border-primary">
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
          className="w-full border-0 bg-transparent p-0 text-xs font-semibold text-foreground outline-none focus:ring-0 placeholder:text-muted-foreground"
        />
        <ChevronDown
          size={14}
          className="text-muted-foreground shrink-0 ml-1 cursor-pointer transition-transform duration-200"
          onClick={() => setIsOpen(!isOpen)}
        />
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-[320px] z-[99999] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(null);
              setIsOpen(false);
              setSearch("");
              setHighlightIndex(0);
            }}
            className="cursor-pointer p-2.5 px-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-xs text-slate-400 italic flex justify-between items-center transition-colors"
          >
            <span>Custom item (no inventory link)</span>
            {!value && <Check className="size-3.5 text-blue-600 shrink-0" />}
          </div>

          {matched.length === 0 ? (
            <div className="p-3 text-xs text-slate-400 dark:text-slate-500 italic text-center bg-white dark:bg-slate-900">
              No products found.
            </div>
          ) : (
            (() => {
              let runningIdx = 0;
              return Object.entries(grouped).map(([cat, prods]) => (
                <div key={cat} className="bg-white dark:bg-slate-900">
                  <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 shadow-sm">
                    {cat.replace(/_/g, " ")}
                  </div>
                  {prods.map((p) => {
                    const currentIdx = runningIdx++;
                    const isHighlighted = currentIdx === highlightIndex;
                    const isSelected = p.id === value;
                    const code = p.metadata?.code || p.metadata?.sku || p.id.slice(0, 8);

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
                        className={`cursor-pointer border-b border-slate-100 dark:border-slate-800 p-2.5 px-3 flex justify-between items-center transition-colors ${
                          isHighlighted
                            ? "bg-blue-600 text-white font-extrabold shadow-sm"
                            : isSelected
                              ? "bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-extrabold"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        <span className="truncate pr-2 font-medium text-xs">{p.name}</span>
                        {code && (
                          <span className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-md shrink-0 uppercase border ${
                            isHighlighted
                              ? "bg-blue-700 text-white border-blue-500"
                              : "text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
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

  function updateLine(index: number, field: keyof LineItem, value: string) {
    const updated = lines.map((l, i) =>
      i === index ? { ...l, [field]: value } : l
    );
    onChange(updated);
  }

  function addLine() {
    onChange([
      ...lines,
      { 
        description: "", 
        quantity: "1", 
        unitPrice: "", 
        accountId: "", 
        taxRateId: "", 
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
      <div className="rounded-2xl border border-slate-200/90 overflow-x-auto bg-white shadow-xs">
        <div className="min-w-[1050px]">
          {/* Header Row Matching Proxy Order */}
          <div className="grid grid-cols-[36px_1.8fr_1.1fr_75px_70px_70px_65px_65px_95px_90px_100px_36px] gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-slate-500">
            <span className="text-center">#</span>
            <span>Name of Item</span>
            <span>Project <span className="text-[9px] font-normal normal-case text-slate-400">(opt)</span></span>
            <span className="text-center">GST%</span>
            <span className="text-center">Width</span>
            <span className="text-center">Length</span>
            <span className="text-center">Sq.Ft.</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Rate/Sft</span>
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
            const widthNum = parseFloat(line.width || "0");
            const lengthNum = parseFloat(line.length || "0");
            const calculatedSqFt = (widthNum > 0 && lengthNum > 0) ? (widthNum * lengthNum).toFixed(2) : "--";

            return (
              <div
                key={i}
                className="grid grid-cols-[36px_1.8fr_1.1fr_75px_70px_70px_65px_65px_95px_90px_100px_36px] gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 items-center hover:bg-slate-50/50 transition-colors"
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
                        const matchingTax = item.gstRate ? taxRates.find(t => (t.rate / 100) === item.gstRate) : null;
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
                          accountId: (taxContext === "purchase" ? item.expenseAccountId : item.revenueAccountId) || updated[i].accountId,
                          taxRateId: matchingTax ? matchingTax.id : updated[i].taxRateId,
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
                    value={line.taxRateId || "none"}
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

                {/* Qty */}
                <div>
                  <Input
                    className="h-9 text-center text-xs font-black font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, "quantity", e.target.value)}
                  />
                </div>

                {/* Rate/Sft */}
                <div>
                  <CurrencyInput
                    size="sm"
                    className="h-9 text-right text-xs font-bold font-mono bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
                    value={line.unitPrice}
                    onChange={(v) => updateLine(i, "unitPrice", v)}
                  />
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

          {/* Add Line & Summary Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/70 p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="bg-white hover:bg-slate-50 border-slate-200 text-slate-800 font-bold text-xs rounded-xl shadow-xs gap-1.5 h-9 px-4"
            >
              <Plus className="size-3.5 text-blue-600" />
              <span>Add Another Item</span>
            </Button>

            <div className="flex items-center gap-6 text-xs font-mono text-slate-600">
              <div>
                <span className="text-slate-400 mr-2 font-sans font-medium">Items Subtotal:</span>
                <span className="font-bold text-slate-800">₹{productSubtotal.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-400 mr-2 font-sans font-medium">GST Total:</span>
                <span className="font-bold text-slate-800">₹{taxTotal.toFixed(2)}</span>
              </div>
              <div className="text-sm bg-blue-50 text-blue-900 border border-blue-200/80 px-3 py-1 rounded-xl">
                <span className="text-blue-600 mr-2 font-sans font-bold">Total:</span>
                <span className="font-black text-blue-950">₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
