'use client';

import { useState, useEffect } from 'react';

/**
 * Listens for F2 keypress globally and opens/closes the date picker popup.
 * Returns { isOpen, open, close } — wire these into F2DatePicker.
 */
export function useF2DateShortcut() {
  const [isOpen, setIsOpen] = useState(false);

  const open  = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        // Don't block F2 if user is typing in a non-date text field
        const tag      = (e.target as HTMLElement)?.tagName;
        const inputType = (e.target as HTMLInputElement)?.type;
        if (tag === 'TEXTAREA') return;
        if (tag === 'INPUT' && inputType !== 'date' && inputType !== 'text') return;

        e.preventDefault();
        setIsOpen(prev => !prev); // toggle — F2 again closes it
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return { isOpen, open, close };
}