'use client';

import React, { useState, useRef, useEffect, forwardRef } from 'react';
import { format, parse, isValid } from 'date-fns';

interface DateTextInputProps {
  value: string;           // yyyy-MM-dd (internal format)
  onChange: (v: string) => void; // fires with yyyy-MM-dd
  onEnter?: () => void;
  onTab?: () => void;
  className?: string;
  placeholder?: string;
}

/** Convert yyyy-MM-dd → DD-MM-YYYY for display */
function toDisplay(iso: string): string {
  if (!iso) return '';
  const d = parse(iso, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'dd-MM-yyyy') : iso;
}

/** Convert DD-MM-YYYY → yyyy-MM-dd, or return '' if invalid */
function toISO(display: string): string {
  const clean = display.replace(/\D/g, '');
  if (clean.length !== 8) return '';
  const d = parse(display, 'dd-MM-yyyy', new Date());
  return isValid(d) ? format(d, 'yyyy-MM-dd') : '';
}

/** Auto-insert dashes as user types digits: 01 → 01- → 01-07- → 01-07-2026 */
function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export const DateTextInput = forwardRef<HTMLInputElement, DateTextInputProps>(
  ({ value, onChange, onEnter, onTab, className = '', placeholder = 'DD-MM-YYYY' }, ref) => {
    const [text, setText] = useState(toDisplay(value));

    // Sync if parent changes value externally
    useEffect(() => {
      setText(toDisplay(value));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = autoFormat(e.target.value);
      setText(formatted);
      // Fire onChange only when we have a full valid date
      if (formatted.length === 10) {
        const iso = toISO(formatted);
        if (iso) onChange(iso);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        // Try to commit whatever is typed
        const iso = toISO(text);
        if (iso) onChange(iso);
        onEnter?.();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const iso = toISO(text);
        if (iso) onChange(iso);
        onTab?.();
      }
    };

    const handleBlur = () => {
      const iso = toISO(text);
      if (iso) {
        onChange(iso);
        setText(toDisplay(iso));
      } else if (text === '') {
        onChange('');
      } else {
        // Restore previous valid value
        setText(toDisplay(value));
      }
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={10}
        className={`text-sm border rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all tabular-nums tracking-wider ${className}`}
      />
    );
  }
);
DateTextInput.displayName = 'DateTextInput';
