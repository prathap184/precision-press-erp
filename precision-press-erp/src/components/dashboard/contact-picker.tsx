"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, ChevronsUpDown, Plus, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  CommandSeparator,
} from "@/components/ui/command";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  type: string;
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

interface ContactPickerProps {
  value: string;
  onChange: (contactId: string) => void;
  type?: "customer" | "supplier";
  placeholder?: string;
  initialContactName?: string;
}

export function ContactPicker({ value, onChange, type, placeholder = "Select contact...", initialContactName }: ContactPickerProps) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);
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

  // Fetch contacts on mount so a pre-filled value can display the contact name
  // immediately. The popover open/close state no longer gates the initial load.
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

        // Auto-match contact by ID or name
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

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      loadContacts();
    }
  };

  const selected = findContactMatch(contacts, value, initialContactName);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{selected.name}</span>
              {typeBadge[selected.type] && (
                <Badge variant="outline" className={cn("shrink-0 text-[10px] px-1.5 py-0", typeBadge[selected.type].class)}>
                  {typeBadge[selected.type].label}
                </Badge>
              )}
            </span>
          ) : initialContactName ? (
            <span className="flex items-center gap-2 truncate font-semibold text-slate-800">
              <span className="truncate">{initialContactName}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-[9999] opacity-100 w-[var(--radix-popover-trigger-width)] max-h-[300px]" align="start">
        <Command>
          <CommandInput placeholder="Search contacts..." />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">No contacts found</span>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {contacts.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.phone || ""} ${c.email || ""} ${c.taxNumber || ""}`}
                      onSelect={() => {
                        onChange(c.id === value ? "" : c.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("size-4 shrink-0", value === c.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm">{c.name}</span>
                          {typeBadge[c.type] && (
                            <Badge variant="outline" className={cn("shrink-0 text-[10px] px-1.5 py-0", typeBadge[c.type].class)}>
                              {typeBadge[c.type].label}
                            </Badge>
                          )}
                        </div>
                        {c.email && (
                          <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <CommandSeparator />
          <div className="p-1">
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => {
                setOpen(false);
                openDrawer("contact");
              }}
            >
              <Plus className="size-4 text-muted-foreground" />
              Create new contact
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
