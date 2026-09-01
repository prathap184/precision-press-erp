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
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white shadow-xs">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-[1.5fr_1fr_60px_60px_60px_80px_100px_100px_100px_40px] gap-2 border-b border-slate-200 bg-slate-50/90 px-3 py-2 text-xs font-bold text-slate-600">
            <span>Description</span>
            <span>Project</span>
            <span className="text-right">W</span>
            <span className="text-right">L</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Finish</span>
            <span className="text-right">Amount</span>
            <span>Tax</span>
            <span />
          </div>
        {lines.map((line, i) => {
          if (line.description === "Logistics / Shipping") return null;
          
          const selectedRate = line.taxRateId
            ? taxRates.find((t) => t.id === line.taxRateId)
            : undefined;
          const hint =
            taxContext === "purchase" && selectedRate ? reclaimHint(selectedRate) : null;
          
          const itemMetadata = inventoryItems.find((itm) => itm.id === line.inventoryItemId)?.metadata;
          const isDirectSelling = itemMetadata?.isDirectSelling === true;

          return (
            <div
              key={i}
              className="grid grid-cols-[1.5fr_1fr_60px_60px_60px_80px_100px_100px_100px_40px] gap-2 border-b px-3 py-2 last:border-b-0 items-start"
            >
              <div className="space-y-1">
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
                  className="h-8 text-sm"
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                  placeholder="Item description"
                />
                <AccountPicker
                  value={line.accountId}
                  onChange={(v) => updateLine(i, "accountId", v)}
                  typeFilter={accountTypeFilter}
                  placeholder="Account"
                />
              </div>
              <Input
                className="h-8 text-sm"
                value={line.projectId || ""}
                onChange={(e) => updateLine(i, "projectId", e.target.value)}
                placeholder="Project"
              />
              {isDirectSelling ? (
                <div className="h-8 flex items-center justify-center text-muted-foreground bg-muted/20 rounded-md border border-dashed border-muted">-</div>
              ) : (
                <Input
                  className="h-8 text-right text-sm font-mono tabular-nums"
                  type="number"
                  value={line.width || ""}
                  onChange={(e) => updateLine(i, "width", e.target.value)}
                  placeholder="W"
                />
              )}
              {isDirectSelling ? (
                <div className="h-8 flex items-center justify-center text-muted-foreground bg-muted/20 rounded-md border border-dashed border-muted">-</div>
              ) : (
                <Input
                  className="h-8 text-right text-sm font-mono tabular-nums"
                  type="number"
                  value={line.length || ""}
                  onChange={(e) => updateLine(i, "length", e.target.value)}
                  placeholder="L"
                />
              )}
              <Input
                className="h-8 text-right text-sm font-mono tabular-nums"
                type="number"
                value={line.quantity}
                onChange={(e) => updateLine(i, "quantity", e.target.value)}
              />
              <CurrencyInput
                size="sm"
                value={line.unitPrice}
                onChange={(v) => updateLine(i, "unitPrice", v)}
              />
              {isDirectSelling ? (
                <div className="h-8 flex items-center justify-center text-muted-foreground bg-muted/20 rounded-md border border-dashed border-muted">-</div>
              ) : (
                <CurrencyInput
                  size="sm"
                  value={line.finishAmount || ""}
                  onChange={(v) => updateLine(i, "finishAmount", v)}
                />
              )}
              <span className="flex h-8 items-center justify-end text-sm font-mono font-medium tabular-nums">
                {lineAmount(line).toFixed(2)}
              </span>
              <div className="space-y-1">
                <Select
                  value={line.taxRateId || "none"}
                  onValueChange={(v) => updateLine(i, "taxRateId", v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="No tax" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tax</SelectItem>
                    {taxRates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({formatRatePct(t.rate)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hint && (
                  <p className="text-[11px] text-muted-foreground">{hint}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                tabIndex={-1}
                className="size-8"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 1}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addLine}
            className="text-xs"
          >
            <Plus className="mr-1 size-3" />
            Add line
          </Button>
          <div className="space-y-0.5 text-right text-sm font-mono tabular-nums">
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{productSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Tax</span>
              <span>{taxTotal.toFixed(2)}</span>
            </div>
            {taxTotal > 0 && (
              <>
                <div className="flex justify-between gap-6 text-xs text-muted-foreground">
                  <span>CGST Breakdown</span>
                  <span>{(taxTotal / 2).toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-6 text-xs text-muted-foreground">
                  <span>SGST Breakdown</span>
                  <span>{(taxTotal / 2).toFixed(2)}</span>
                </div>
              </>
            )}
            {logisticsTotal > 0 && (
              <div className="flex justify-between gap-6">
                <span className="text-muted-foreground">Logistics</span>
                <span>{logisticsTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between gap-6 font-semibold border-t border-dashed mt-1 pt-1">
              <span>Total</span>
              <span>{total.toFixed(2)}</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
