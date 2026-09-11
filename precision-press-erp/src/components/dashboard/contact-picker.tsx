"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Check, Search, Plus, Loader2, ChevronDown, X } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { formatMoney } from "@/lib/money";

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  taxNumber?: string | null;
  type: string;
  owesYou?: number;
  youOwe?: number;
  currencyCode?: string;
}

const typeBadge: Record<string, { class: string; label: string }> = {
  customer: {
    class: "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400",
    label: "Customer",
  },
  supplier: {
    class: "border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
    label: "Supplier",
  },
  both: {
    class: "border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
    label: "Both",
  },
};

export interface ContactPickerProps {
  value: string;
  onChange: (contactId: string) => void;
  type?: "customer" | "supplier";
  placeholder?: string;
  initialContactName?: string;
  id?: string;
  autoFocus?: boolean;
  onSelectAdvance?: () => void;
}

export function ContactPicker({
  value,
  onChange,
  type,
  placeholder,
  initialContactName,
  id,
  autoFocus = false,
  onSelectAdvance,
}: ContactPickerProps) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownListRef = useRef<HTMLDivElement>(null);

  const { open: openDrawer } = useCreateDrawer();

  const findContactMatch = useCallback((list: Contact[], val?: string, name?: string) => {
    if (!list || list.length === 0) return null;
    if (val) {
      const byId = list.find((c: any) => c.id === val || c.uid === val);
      if (byId) return byId;
    }
    if (name && name.trim() && name !== "Guest") {
      const cleanName = name.trim().toLowerCase();
      const exact = list.find((c) => c.name && c.name.trim().toLowerCase() === cleanName);
      if (exact) return exact;
      const partial = list.find((c) => c.name && (c.name.toLowerCase().includes(cleanName) || cleanName.includes(c.name.toLowerCase())));
      if (partial) return partial;
    }
    return null;
  }, []);

  const loadContacts = useCallback(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    const headers: Record<string, string> = {};
    if (orgId) headers["x-organization-id"] = orgId;

    const params = new URLSearchParams({ limit: "2500" });
    if (type) params.set("type", type);

    fetch(`/api/v1/contacts?${params}`, { headers })
      .then((r) => r.json())
      .then((data) => {
        const list: Contact[] = data.data || (Array.isArray(data) ? data : []);
        setContacts(list);

        const match = findContactMatch(list, value, initialContactName);
        if (match && match.id && match.id !== value) {
          onChange(match.id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type, value, initialContactName, onChange, findContactMatch]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Dismiss dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = findContactMatch(contacts, value, initialContactName);

  // Filter contacts by name, phone, email, taxNumber (GSTIN)
  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;

    const tokens = q.split(/\s+/).filter(Boolean);
    return contacts
      .filter((c) => {
        const target = `${c.name || ""} ${c.phone || ""} ${c.email || ""} ${c.taxNumber || ""}`.toLowerCase();
        return tokens.every((tok) => target.includes(tok));
      })
      .sort((a, b) => {
        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        if (aName === q && bName !== q) return -1;
        if (bName === q && aName !== q) return 1;
        if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
        if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
        return 0;
      });
  }, [contacts, search]);

  // Safe dropdown scroll (only scrolls inner dropdown list, never window)
  const scrollDropdownToIndex = useCallback((index: number) => {
    const list = dropdownListRef.current;
    if (!list) return;
    const item = list.children[index] as HTMLElement | undefined;
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

  const handleSelect = (contact: Contact) => {
    onChange(contact.id);
    setOpen(false);
    setSearch("");
    setHighlightIndex(0);
    if (onSelectAdvance) {
      onSelectAdvance();
      requestAnimationFrame(() => onSelectAdvance());
    }
  };

  const defaultPlaceholder = type === "supplier"
    ? "Search supplier by name, phone, GSTIN..."
    : "Search customer by name, phone, GSTIN...";

  const displayInputValue = search !== ""
    ? search
    : (selected ? selected.name : initialContactName || "");

  return (
    <div ref={containerRef} className={`relative w-full ${open ? "z-[99999]" : ""}`}>
      <div
        className={`flex h-10 w-full items-center rounded-xl px-3 transition-all duration-150 ${
          open
            ? "border-2 border-blue-600 bg-white ring-4 ring-blue-500/20 shadow-md"
            : "border-2 border-slate-200 bg-slate-50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:bg-white"
        }`}
      >
        {loading ? (
          <Loader2 size={16} className="mr-2 animate-spin text-blue-600 shrink-0" />
        ) : (
          <Search
            size={16}
            className={`mr-2 transition-colors shrink-0 ${open ? "text-blue-600" : "text-slate-400"}`}
          />
        )}
        <input
          ref={inputRef}
          id={id || "contact-picker-search-input"}
          autoFocus={autoFocus}
          value={displayInputValue}
          placeholder={placeholder || defaultPlaceholder}
          data-dropdown-open={open ? "true" : "false"}
          onChange={(e) => {
            setOpen(true);
            setSearch(e.target.value);
            setHighlightIndex(0);
            scrollDropdownToIndex(0);
          }}
          onFocus={(e) => {
            setOpen(true);
            if (selected) {
              setSearch(selected.name);
              try { e.target.select(); } catch {}
            } else if (initialContactName) {
              setSearch(initialContactName);
              try { e.target.select(); } catch {}
            } else {
              setSearch("");
            }
            setHighlightIndex(0);
            scrollDropdownToIndex(0);
          }}
          onKeyDown={(e) => {
            if (filteredContacts.length === 0) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                setHighlightIndex(0);
                scrollDropdownToIndex(0);
                return;
              }
              setHighlightIndex((prev) => {
                const next = Math.min(prev + 1, filteredContacts.length - 1);
                scrollDropdownToIndex(next);
                return next;
              });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIndex((prev) => {
                const next = Math.max(prev - 1, 0);
                scrollDropdownToIndex(next);
                return next;
              });
            } else if (e.key === "Enter") {
              if (open && filteredContacts.length > 0) {
                e.preventDefault();
                const contact = filteredContacts[highlightIndex] || filteredContacts[0];
                if (contact) {
                  handleSelect(contact);
                }
              }
            } else if (e.key === "Escape") {
              setOpen(false);
              setSearch("");
            }
          }}
          className="h-full w-full border-0 focus:ring-0 p-0 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-400"
        />

        {selected && !open && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setSearch("");
              setOpen(true);
              inputRef.current?.focus();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 mr-1 shrink-0 transition-colors"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        )}

        <ChevronDown
          size={16}
          className={`ml-1 transition-colors shrink-0 cursor-pointer ${open ? "text-blue-600" : "text-slate-400"}`}
          onClick={() => {
            setOpen(!open);
            if (!open) inputRef.current?.focus();
          }}
        />
      </div>

      {/* Floating Dropdown List */}
      {open && (
        <div
          ref={dropdownListRef}
          className="absolute left-0 top-full mt-1.5 w-full min-w-[340px] z-[9999] max-h-72 overflow-y-auto rounded-xl border-2 border-blue-600 bg-white shadow-2xl divide-y divide-slate-100"
        >
          {filteredContacts.length === 0 ? (
            <div className="p-4 text-xs italic text-slate-400 text-center">
              {loading ? "Loading contacts..." : `No ${type || "contact"} matching "${search}".`}
            </div>
          ) : (
            filteredContacts.slice(0, 50).map((c, idx) => {
              const isHighlighted = idx === highlightIndex;
              const isSelected = c.id === value;
              return (
                <div
                  key={c.id}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(c);
                  }}
                  className={`cursor-pointer px-3.5 py-2.5 transition-colors flex items-center justify-between gap-3 ${
                    isHighlighted
                      ? "bg-blue-600 text-white font-medium"
                      : isSelected
                      ? "bg-blue-50 text-blue-900 font-medium"
                      : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold truncate ${isHighlighted ? "text-white" : "text-slate-900"}`}>
                        {c.name}
                      </span>
                      {typeBadge[c.type] && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-bold ${
                            isHighlighted
                              ? "bg-white/20 text-white"
                              : typeBadge[c.type].class
                          }`}
                        >
                          {typeBadge[c.type].label}
                        </span>
                      )}
                    </div>
                    <div className={`text-xs truncate mt-0.5 ${isHighlighted ? "text-blue-100" : "text-slate-500"}`}>
                      {c.phone || c.email || "No phone"}
                      {c.taxNumber ? ` • GST: ${c.taxNumber}` : ""}
                    </div>
                  </div>

                  {c.owesYou && c.owesYou > 0 ? (
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-bold tabular-nums ${isHighlighted ? "text-white" : "text-emerald-600"}`}>
                        {formatMoney(c.owesYou, c.currencyCode || "INR")}
                      </span>
                      <div className={`text-[10px] uppercase font-bold tracking-wider ${isHighlighted ? "text-blue-100" : "text-slate-400"}`}>
                        Due
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}

          {/* Keyboard hints and Create New Contact button */}
          <div className="px-3 py-2 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100">
            <span>Press <kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-600">Enter</kbd> to select</span>
            <span>Navigate <kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-600">↑</kbd><kbd className="font-mono bg-white border border-slate-200 px-1 rounded text-slate-600">↓</kbd></span>
          </div>
          <div className="p-1.5 bg-slate-50 border-t border-slate-100">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                openDrawer("contact");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Plus className="size-3.5" />
              Create new contact
            </button>
          </div>
        </div>
      )}

      {/* Selected Contact details info strip */}
      {selected && !open && (
        <div className="mt-2 rounded-xl bg-blue-50/60 p-2.5 text-xs font-medium text-slate-700 border border-blue-100 flex items-center justify-between">
          <div className="truncate">
            <span className="font-bold text-blue-900">{selected.name}</span>
            {selected.phone ? ` • ${selected.phone}` : ""}
            {selected.taxNumber ? ` • GST: ${selected.taxNumber}` : ""}
          </div>
          {selected.owesYou && selected.owesYou > 0 ? (
            <span className="text-[11px] font-bold text-emerald-700 shrink-0 ml-2">
              Due: {formatMoney(selected.owesYou, selected.currencyCode || "INR")}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
