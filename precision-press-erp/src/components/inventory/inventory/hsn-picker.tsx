"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface HsnData {
  code: string;
  description: string;
  gst: number;
}

interface HsnPickerProps {
  value: string;
  onChange: (value: string, defaultGst: number, description: string) => void;
}

export function HsnPicker({ value, onChange }: HsnPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [hsnCodes, setHsnCodes] = React.useState<HsnData[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadHsns() {
      try {
        const res = await fetch("/api/v1/hsn");
        if (res.ok) {
          const data = await res.json();
          setHsnCodes(data.hsns || []);
        }
      } catch (err) {
        console.error("Failed to load Hsns", err);
      } finally {
        setLoading(false);
      }
    }
    loadHsns();
  }, []);

  const selected = hsnCodes.find((hsn) => hsn.code === value);

  return (
    <>
      <input type="hidden" name="hsnCode" value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal text-left h-9 px-3 text-sm"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading HSN...
              </span>
            ) : selected ? (
              <span className="truncate">
                {selected.code} - {selected.description}
              </span>
            ) : (
              <span className="text-muted-foreground">Select HSN code...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search HSN code or description..." />
            <CommandList>
              <CommandEmpty>No HSN code found.</CommandEmpty>
              <CommandGroup>
                {hsnCodes.map((hsn) => (
                  <CommandItem
                    key={hsn.code}
                    value={`${hsn.code} ${hsn.description}`}
                    onSelect={() => {
                      onChange(hsn.code, hsn.gst, hsn.description);
                      setOpen(false);
                    }}
                    className="flex flex-col items-start py-2"
                  >
                    <div className="flex w-full items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === hsn.code ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-medium">{hsn.code}</span>
                      <span className="ml-auto text-xs text-muted-foreground font-medium">GST {hsn.gst}%</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-6 line-clamp-2">
                      {hsn.description}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
