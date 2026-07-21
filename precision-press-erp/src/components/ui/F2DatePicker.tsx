'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format, parse, isValid } from 'date-fns';
import { Calendar } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** yyyy-MM-dd  →  DD-MM-YYYY */
function toDisplay(iso: string): string {
  if (!iso) return '';
  const d = parse(iso, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'dd-MM-yyyy') : '';
}

/** DD-MM-YYYY  →  yyyy-MM-dd  (returns '' if invalid) */
function toISO(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const d = parse(
    `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`,
    'dd-MM-yyyy',
    new Date(),
  );
  return isValid(d) ? format(d, 'yyyy-MM-dd') : '';
}

/** Auto-insert dashes as digits are typed */
function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface F2DatePickerProps {
  /** Currently active from/to values in yyyy-MM-dd */
  currentFrom: string;
  currentTo: string;
  /** Called when user confirms — receives (from, to) in yyyy-MM-dd */
  onApply: (from: string, to: string) => void;
  /** Called when popup should close without applying */
  onClose: () => void;
}

export function F2DatePicker({ currentFrom, currentTo, onApply, onClose }: F2DatePickerProps) {
  const [fromText, setFromText] = useState(toDisplay(currentFrom));
  const [toText, setToText]     = useState(toDisplay(currentTo));
  const [stage, setStage]       = useState<'FROM' | 'TO'>('FROM');

  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef   = useRef<HTMLInputElement>(null);

  // Focus From on mount
  useEffect(() => {
    fromInputRef.current?.focus();
    fromInputRef.current?.select();
  }, []);

  // Focus whichever field is active
  useEffect(() => {
    if (stage === 'FROM') {
      fromInputRef.current?.focus();
      fromInputRef.current?.select();
    } else {
      toInputRef.current?.focus();
      toInputRef.current?.select();
    }
  }, [stage]);

  const handleApply = useCallback((fromVal: string, toVal: string) => {
    const isoFrom = toISO(fromVal) || currentFrom;
    const isoTo   = toISO(toVal)   || isoFrom; // if To empty → use From
    onApply(isoFrom, isoTo);
  }, [currentFrom, onApply]);

  // ── From field keydown ────────────────────────────────────────────────────
  const onFromKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      setStage('TO');
    }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // ── To field keydown ──────────────────────────────────────────────────────
  const onToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply(fromText, toText);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      handleApply(fromText, toText);
    }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // ── Auto-format helpers ───────────────────────────────────────────────────
  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFromText(autoFormat(e.target.value));

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setToText(autoFormat(e.target.value));

  const fromISO = toISO(fromText);
  const toISO_  = toISO(toText);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
      />

      {/* Popup Window */}
      <div
        className="fixed z-[9999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                   bg-white border-2 border-indigo-500 rounded-xl shadow-2xl
                   w-80 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Title bar — exactly like Tally */}
        <div className="bg-indigo-600 text-white px-4 py-2.5 flex items-center gap-2">
          <Calendar size={16} />
          <span className="text-sm font-semibold tracking-wide">Change Period</span>
          <button
            onClick={onClose}
            className="ml-auto text-indigo-200 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-5 space-y-4">

          {/* From */}
          <div className="flex items-center gap-3">
            <label
              className={`w-16 text-sm font-semibold shrink-0 ${stage === 'FROM' ? 'text-indigo-600' : 'text-slate-500'}`}
            >
              From
            </label>
            <div className="relative flex-1">
              <input
                ref={fromInputRef}
                type="text"
                inputMode="numeric"
                value={fromText}
                onChange={handleFromChange}
                onKeyDown={onFromKeyDown}
                placeholder="DD-MM-YYYY"
                maxLength={10}
                className={`w-full px-3 py-2 text-sm font-mono border-2 rounded-lg outline-none transition-all tracking-wider
                  ${stage === 'FROM'
                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                    : 'border-slate-200 bg-slate-50'}`}
              />
              {fromISO && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-indigo-400 font-medium">
                  ✓
                </span>
              )}
            </div>
          </div>

          {/* To */}
          <div className="flex items-center gap-3">
            <label
              className={`w-16 text-sm font-semibold shrink-0 ${stage === 'TO' ? 'text-indigo-600' : 'text-slate-500'}`}
            >
              To
            </label>
            <div className="relative flex-1">
              <input
                ref={toInputRef}
                type="text"
                inputMode="numeric"
                value={toText}
                onChange={handleToChange}
                onKeyDown={onToKeyDown}
                placeholder="DD-MM-YYYY  (Enter to use From)"
                maxLength={10}
                className={`w-full px-3 py-2 text-sm font-mono border-2 rounded-lg outline-none transition-all tracking-wider
                  ${stage === 'TO'
                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                    : 'border-slate-200 bg-slate-50'}`}
              />
              {toISO_ && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-indigo-400 font-medium">
                  ✓
                </span>
              )}
            </div>
          </div>

          {/* Hint */}
          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            Type date as <span className="font-mono font-semibold text-slate-500">DD-MM-YYYY</span>&nbsp;·&nbsp;
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 text-[10px]">Enter</kbd> to proceed&nbsp;·&nbsp;
            <kbd className="bg-slate-100 border border-slate-200 rounded px-1 text-[10px]">Esc</kbd> to cancel
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={() => handleApply(fromText, toText)}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Apply
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
