'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';

interface TallyPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (fromDate: string, toDate: string) => void;
  initialFromDate?: string;
  initialToDate?: string;
  title?: string;
}

export function TallyPeriodModal({
  isOpen,
  onClose,
  onApply,
  initialFromDate = '',
  initialToDate = '',
  title = 'Change Period (F2)',
}: TallyPeriodModalProps) {
  const [tempFromDate, setTempFromDate] = useState(initialFromDate);
  const [tempToDate, setTempToDate] = useState(initialToDate);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTempFromDate(initialFromDate);
      setTempToDate(initialToDate);
      const timer = setTimeout(() => {
        fromInputRef.current?.focus();
        try {
          fromInputRef.current?.select();
        } catch {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialFromDate, initialToDate]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onApply(tempFromDate, tempToDate);
    onClose();
  };

  const handleClear = () => {
    setTempFromDate('');
    setTempToDate('');
    onApply('', '');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border-2 border-slate-900 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tally Header */}
        <div className="bg-slate-900 px-4 py-3 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-emerald-400" />
            <h3 className="text-xs font-black uppercase tracking-wider">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded transition-colors"
          >
            ✕ [Esc]
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 bg-slate-50">
          <div className="space-y-1.5">
            <label htmlFor="tally-period-from" className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>From Date</span>
              <span className="text-[10px] font-semibold text-slate-400 font-mono">Enter ↵ to jump to 'To Date'</span>
            </label>
            <input
              id="tally-period-from"
              ref={fromInputRef}
              type="date"
              value={tempFromDate}
              onChange={(e) => setTempFromDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  toInputRef.current?.focus();
                  try {
                    toInputRef.current?.select();
                  } catch {}
                }
              }}
              className="h-10 w-full bg-white text-slate-900 font-bold text-sm px-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all cursor-pointer"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tally-period-to" className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>To Date</span>
              <span className="text-[10px] font-semibold text-slate-400 font-mono">Optional (Single day if blank)</span>
            </label>
            <input
              id="tally-period-to"
              ref={toInputRef}
              type="date"
              value={tempToDate}
              onChange={(e) => setTempToDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="h-10 w-full bg-white text-slate-900 font-bold text-sm px-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all cursor-pointer"
            />
          </div>

          <p className="text-[11px] text-slate-500 bg-blue-50/80 border border-blue-100 rounded-lg p-2 font-medium">
            💡 If <strong>To Date</strong> is left blank, only records for <strong>{tempFromDate || 'From Date'}</strong> will be displayed.
          </p>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-all"
            >
              Clear (All)
            </button>
            <div className="flex-1 flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
              >
                Apply Period ↵
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
