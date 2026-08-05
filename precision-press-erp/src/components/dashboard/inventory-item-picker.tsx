"use client";

import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Loader2, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebounce } from "@/lib/hooks/use-debounce";

interface InventoryItemOption {
  id: string;
  name: string;
  code: string;
  sku: string | null;
  quantityOnHand: number;
}

interface InventoryItemPickerProps {
  value: string;
  onChange: (itemId: string) => void;
  placeholder?: string;
}

export function InventoryItemPicker({ value, onChange, placeholder = "Select item..." }: InventoryItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InventoryItemOption[]>([]);
  const [selected, setSelected] = useState<InventoryItemOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const fetchIdRef = useRef(0);

  // Fetch items when debounced search changes (while open)
  useEffect(() => {
    if (!open) return;
    const id = ++fetchIdRef.current;
    const params = new URLSearchParams({ limit: "50" });
    if (debouncedSearch) params.set("search", debouncedSearch);

    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    fetch(`/api/v1/inventory?${params}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        const raw = data.data || data.items || (Array.isArray(data) ? data : null);
        if (id === fetchIdRef.current && raw) {
          setItems(raw);
          setLoading(false);
        }
      })
      .catch(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [open, debouncedSearch]);

  // Resolve the selected item label if we have a value but no match yet
  const resolvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!value) return;
    if (items.find((i) => i.id === value)) return;
    if (resolvedRef.current === value) return;
    let cancelled = false;

    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    fetch(`/api/v1/inventory/${value}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          resolvedRef.current = value;
          const item = data.data || data.item || data;
          if (item?.id) {
            setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [item, ...prev]));
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [value, items]);

  // Derive selected from items list or keep the fetched resolution
  const selectedItem = !value ? null : items.find((i) => i.id === value) || selected;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setLoading(true);
    } else {
      setSearch("");
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9"
        >
          {selectedItem ? (
            <span className="truncate">
              {selectedItem.name} <span className="text-muted-foreground">({selectedItem.code})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 z-[100] w-[var(--radix-popover-trigger-width)] max-h-[300px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search items..."
            value={search}
            onValueChange={(v) => { setSearch(v); setLoading(true); }}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-1.5 py-2">
                  <Package className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {search ? "No items match your search" : "No items found"}
                  </span>
                </div>
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      onChange(item.id === value ? "" : item.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check className={cn("size-4 shrink-0", value === item.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-sm">{item.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {item.code}{item.sku ? ` · ${item.sku}` : ""} · Qty: {item.quantityOnHand}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
