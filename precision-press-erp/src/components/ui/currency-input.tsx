"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/dashboard/org-loader";
import { getCurrencySymbol } from "@/lib/money";

interface CurrencyInputProps {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  prefix?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  name?: string;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = "0.00",
  className,
  prefix: manualPrefix,
  size = "default",
  disabled,
  name,
  id,
  onKeyDown,
}: CurrencyInputProps) {
  const { organization } = useOrganization();
  const prefix = manualPrefix !== undefined ? manualPrefix : getCurrencySymbol(organization?.currency);

  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "border-input flex items-center rounded-md border bg-transparent shadow-xs transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        disabled && "pointer-events-none opacity-50",
        size === "sm" ? "h-8" : "h-9",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {prefix && (
        <span className={cn(
          "select-none text-muted-foreground pl-2.5 font-mono",
          size === "sm" ? "text-xs" : "text-sm",
        )}>
          {prefix}
        </span>
      )}
      {name && <input type="hidden" name={name} value={value} />}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || /^-?\d*\.?\d{0,2}$/.test(v)) {
            onChange(v);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
        className={cn(
          "flex-1 min-w-0 bg-transparent border-0 border-none text-right font-mono tabular-nums outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 placeholder:text-muted-foreground",
          size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-1 md:text-sm",
        )}
      />
    </div>
  );
}
