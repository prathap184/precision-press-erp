'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

interface ItemDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAndAdvance: (text: string) => void;
  initialValue: string;
  itemName?: string;
  title?: string;
}

export function ItemDescriptionModal({
  isOpen,
  onClose,
  onSaveAndAdvance,
  initialValue,
  itemName = 'Item',
  title = 'Description for Stock Item',
}: ItemDescriptionModalProps) {
  const [text, setText] = useState(initialValue || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setText(initialValue || '');
      const timer = setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          try {
            textareaRef.current.setSelectionRange(
              textareaRef.current.value.length,
              textareaRef.current.value.length
            );
          } catch {}
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onSaveAndAdvance(text);
      return;
    }

    if (e.key === 'Enter') {
      const target = e.currentTarget;
      const { selectionStart, value } = target;
      const beforeCursor = value.substring(0, selectionStart);
      const lastNewline = beforeCursor.lastIndexOf('\n');
      const currentLine = beforeCursor.substring(lastNewline + 1);

      // If the current line is empty, exit and save!
      if (currentLine.trim() === '') {
        e.preventDefault();
        const cleanedText = text.trimEnd();
        onSaveAndAdvance(cleanedText);
      }
    }
  };

  const handleApply = () => {
    onSaveAndAdvance(text.trimEnd());
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-100">
      <div 
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border-2 border-slate-900 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 px-4 py-2.5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider">{title}</h3>
          </div>
          <button
            type="button"
            onClick={() => onSaveAndAdvance(text)}
            className="text-slate-400 hover:text-white text-xs font-bold px-1.5 py-0.5 rounded transition-colors"
          >
            ✕ [Esc]
          </button>
        </div>

        {/* Item context banner */}
        {itemName && (
          <div className="bg-slate-100 px-4 py-1.5 border-b border-slate-200 text-xs font-bold text-slate-700 truncate">
            Item: <span className="text-blue-700 font-semibold">{itemName}</span>
          </div>
        )}

        <div className="p-4 space-y-3 bg-slate-50">
          <div className="space-y-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter additional description line by line...&#10;Press Enter to go to next line.&#10;Press Enter on an empty line to exit.&#10;Type '.' for blank lines."
              rows={6}
              className="w-full bg-white text-slate-900 font-medium text-xs p-3 rounded-xl border-2 border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all resize-none leading-relaxed"
            />
          </div>

          {/* Instructions */}
          <div className="text-[11px] text-slate-500 bg-amber-50/80 border border-amber-200/70 rounded-lg p-2 space-y-0.5">
            <p>⌨️ <strong className="text-slate-700">Enter ↵</strong> = next line in description</p>
            <p>⌨️ <strong className="text-slate-700">Enter on empty line</strong> = Save & Exit to next field</p>
            <p>💡 Type <strong className="text-slate-700 font-mono">.</strong> on a line if you need a space/blank line</p>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setText('');
                onSaveAndAdvance('');
              }}
              className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-all"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md transition-all"
            >
              Save & Next (Enter ↵)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
