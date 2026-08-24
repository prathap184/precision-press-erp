"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Plus, Trash2, Search, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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

  const filteredItems = useMemo(() => {
    if (!search.trim()) return itemsList;
    const q = search.toLowerCase().trim();
    return itemsList.filter(
      (item) =>
        (item?.name && item.name.toLowerCase().includes(q)) ||
        (item?.metadata?.code && String(item.metadata.code).toLowerCase().includes(q)) ||
        (item?.metadata?.sku && String(item.metadata.sku).toLowerCase().includes(q)) ||
        (item?.metadata?.category && String(item.metadata.category).toLowerCase().includes(q))
    );
  }, [itemsList, search]);

  const grouped = useMemo(() => {
    return (filteredItems || []).reduce((acc: Record<string, InventoryItemOption[]>, item) => {
      if (!item) return acc;
      const cat = item.metadata?.category || "General Products";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setSearch("");
        }}
        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate">
          {selectedItem ? selectedItem.name : "Select a product..."}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-[9999] mt-1 max-h-72 w-[340px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="p-2 border-b bg-muted/20 sticky top-0 z-20">
            <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 shadow-sm">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product name, category, SKU..."
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-border/40">
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors"
            >
              <span className="italic text-muted-foreground">Custom item (no inventory link)</span>
              {!value && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>

            {filteredItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                No matching products found.
              </div>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="py-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 bg-muted/40 sticky top-0 z-10">
                    {category}
                  </div>
                  {items.map((item) => {
                    const isSelected = item.id === value;
                    const isItemDirectSelling = item.metadata?.isDirectSelling === true;
                    const rate = isItemDirectSelling
                      ? (Number(item.salePrice || 0) / 100)
                      : (item.metadata?.baseRate != null ? Number(item.metadata.baseRate) : (Number(item.salePrice || 0) / 100));

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSelect(item);
                          setIsOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60 ${
                          isSelected ? "bg-primary/10 font-semibold text-primary" : ""
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="truncate font-medium">{item.name}</div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {item.metadata?.code && (
                              <span className="rounded bg-muted px-1 py-0.2 font-mono">
                                {item.metadata.code}
                              </span>
                            )}
                            <span>₹{rate.toFixed(2)}</span>
                            {item.metadata?.unit && <span>/ {item.metadata.unit}</span>}
                          </div>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
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
      <div className="rounded-lg border overflow-x-auto">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-[1.5fr_1fr_60px_60px_60px_80px_100px_100px_100px_40px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
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
                         ({formatRatePct(t.rate)}%)
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
