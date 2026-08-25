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

      // 1. TALLY-STYLE BACKSPACE HANDLER: Navigates directly to previous field
      if (e.key === "Backspace" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        // In multiline textareas, only go back if cursor is at the start (index 0) or text is selected/empty
        if (tagName === "textarea") {
          const textarea = target as HTMLTextAreaElement;
          const val = textarea.value ?? "";
          const isAtStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
          const isAllSelected = textarea.selectionStart === 0 && textarea.selectionEnd === val.length;
          if (val !== "" && !isAtStart && !isAllSelected) {
            return; // allow normal deletion inside active paragraph
          }
        }

        // Navigate back to previous field (Shift+Tab equivalent)
        if (currentIndex > 0) {
          e.preventDefault();
          const prevEl = focusables[currentIndex - 1];
          prevEl.focus();

          if (prevEl instanceof HTMLInputElement || prevEl instanceof HTMLTextAreaElement) {
            try {
              prevEl.select();
            } catch {
              try {
                const len = prevEl.value.length;
                prevEl.setSelectionRange(0, len);
              } catch {}
            }
          }
        }
        return;
      }

      // 2. ENTER HANDLER (Enter-as-Tab / Enter-to-Advance)
      if (e.key === "Enter" && !e.shiftKey) {
        // Multi-line textarea: allow Enter for newlines ONLY if it already has text.
        // If textarea is empty, or user pressed Ctrl+Enter, advance to next field!
        if (tagName === "textarea") {
          const textarea = target as HTMLTextAreaElement;
          const val = textarea.value.trim();
          if (val !== "" && !e.ctrlKey) {
            return;
          }
        }

        // Form submit buttons handle Enter naturally to submit
        if (tagName === "button" && (target.getAttribute("type") === "submit" || target.classList.contains("btn-submit") || target.innerText.toLowerCase().includes("place order") || target.innerText.toLowerCase().includes("create order") || target.innerText.toLowerCase().includes("save"))) {
          return;
        }

        // Checkbox: toggle check state on Enter and move to next
        if (tagName === "input" && inputType === "checkbox") {
          const cb = target as HTMLInputElement;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
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
