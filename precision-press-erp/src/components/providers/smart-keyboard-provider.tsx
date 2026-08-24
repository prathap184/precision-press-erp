"use client";

import { useEffect } from "react";

/**
 * Focusable form element selector.
 * Excludes hidden, disabled, and non-tabbable items.
 */
const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([readonly]):not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(", ");

function isVisible(el: HTMLElement): boolean {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
}

export function SmartKeyboardProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const target = document.activeElement as HTMLElement | null;
      if (!target) return;

      const tagName = target.tagName.toLowerCase();
      const inputType = (target instanceof HTMLInputElement ? target.type || "text" : "").toLowerCase();

      // Active container (Modal, Drawer/Sheet, or entire page)
      const container =
        target.closest("[role='dialog']") ||
        target.closest("[data-slot='sheet-content']") ||
        target.closest(".sheet-content") ||
        document.body;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => isVisible(el));

      const currentIndex = focusables.indexOf(target);

      // 1. BACKSPACE HANDLER (Dual action: delete if text, go back if empty)
      if (e.key === "Backspace") {
        let shouldNavigateBack = false;

        if (tagName === "input") {
          const input = target as HTMLInputElement;
          const val = input.value ?? "";
          const hasSelection =
            input.selectionStart !== null &&
            input.selectionEnd !== null &&
            input.selectionStart !== input.selectionEnd;

          // If empty, or cursor is at start 0 with no text selected:
          if (!hasSelection && (val === "" || input.selectionStart === 0)) {
            shouldNavigateBack = true;
          }
        } else if (tagName === "select") {
          shouldNavigateBack = true;
        } else if (tagName === "textarea") {
          const textarea = target as HTMLTextAreaElement;
          const val = textarea.value ?? "";
          if (val === "" && textarea.selectionStart === 0) {
            shouldNavigateBack = true;
          }
        } else if (tagName === "button") {
          // If focused on an auxiliary button (like unit button 'ft' or picker trigger), backspace goes back to previous field
          shouldNavigateBack = true;
        }

        if (shouldNavigateBack && currentIndex > 0) {
          e.preventDefault();
          const prevEl = focusables[currentIndex - 1];
          prevEl.focus();

          if (prevEl instanceof HTMLInputElement || prevEl instanceof HTMLTextAreaElement) {
            try {
              prevEl.select();
            } catch {
              try {
                const len = prevEl.value.length;
                prevEl.setSelectionRange(len, len);
              } catch {}
            }
          }
        }
        return;
      }

      // 2. ENTER HANDLER (Enter-as-Tab / Enter-to-Advance)
      if (e.key === "Enter" && !e.shiftKey) {
        // Multi-line textareas use Enter for newline
        if (tagName === "textarea") return;

        // Form submit buttons handle Enter naturally
        if (tagName === "button" && (target.getAttribute("type") === "submit" || target.classList.contains("btn-submit"))) {
          return;
        }

        // If target is inside a custom dropdown search box and a dropdown item is highlighted,
        // let the picker's onKeyDown handler select the item first.
        if (target.getAttribute("data-dropdown-open") === "true") {
          return;
        }

        // Advance to next field
        if (currentIndex >= 0 && currentIndex < focusables.length - 1) {
          e.preventDefault();
          const nextEl = focusables[currentIndex + 1];
          nextEl.focus();

          if (nextEl instanceof HTMLInputElement || nextEl instanceof HTMLTextAreaElement) {
            try {
              nextEl.select();
            } catch {
              try {
                const len = nextEl.value.length;
                nextEl.setSelectionRange(len, len);
              } catch {}
            }
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return <>{children}</>;
}
