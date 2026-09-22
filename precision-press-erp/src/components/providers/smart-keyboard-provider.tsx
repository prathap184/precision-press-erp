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

function selectAll(el: HTMLElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (["button", "submit", "checkbox", "radio", "file"].includes(el.type)) return;
    try {
      if (el.type === "number") {
        (el as any).type = "text";
        el.setSelectionRange(0, el.value.length);
        (el as any).type = "number";
      } else {
        el.select();
      }
    } catch {}
  }
}

function moveCursorToEnd(el: HTMLElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (["button", "submit", "checkbox", "radio", "file"].includes(el.type)) return;
    try {
      if (el.type === "number") {
        (el as any).type = "text";
        const len = el.value ? el.value.length : 0;
        el.setSelectionRange(len, len);
        (el as any).type = "number";
      } else {
        const len = el.value ? el.value.length : 0;
        el.setSelectionRange(len, len);
      }
    } catch {}
  }
}

export function SmartKeyboardProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        if (["button", "submit", "checkbox", "radio", "file"].includes(target.type)) return;
        setTimeout(() => {
          selectAll(target);
        }, 15);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (typeof document !== 'undefined' && document.querySelector('[data-shortcut-modal="true"]')) {
        return;
      }

      const target = document.activeElement as HTMLElement | null;
      if (!target) return;

      const tagName = target.tagName.toLowerCase();
      const inputType = (target instanceof HTMLInputElement ? target.type || "text" : "").toLowerCase();

      // Global shortcut: press 'z' or 'Z' (when not in an input) to navigate to /accounting
      if (
        (e.key === "z" || e.key === "Z") &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        const isEditing =
          tagName === "input" ||
          tagName === "textarea" ||
          target.isContentEditable ||
          tagName === "select";
        if (!isEditing) {
          e.preventDefault();
          window.location.href = "/accounting";
          return;
        }
      }

      // Global Home, End, ArrowRight, ArrowLeft cursor positioning for all inputs & textareas across all pages
      if (e.key === "End" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (tagName === "input" || tagName === "textarea") {
          e.preventDefault();
          moveCursorToEnd(target);
          return;
        }
      } else if (e.key === "Home" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (tagName === "input" || tagName === "textarea") {
          const input = target as HTMLInputElement | HTMLTextAreaElement;
          const isNumber = input.type === "number";
          if (isNumber) {
            try {
              e.preventDefault();
              (input as any).type = "text";
              input.setSelectionRange(0, 0);
              (input as any).type = "number";
            } catch {}
          } else {
            try {
              e.preventDefault();
              input.setSelectionRange(0, 0);
            } catch {}
          }
          return;
        }
      } else if (e.key === "ArrowRight" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (tagName === "input" || tagName === "textarea") {
          const input = target as HTMLInputElement | HTMLTextAreaElement;
          const isNumber = input.type === "number";
          if (isNumber) {
            try {
              e.preventDefault();
              (input as any).type = "text";
              const len = input.value ? input.value.length : 0;
              input.setSelectionRange(len, len);
              (input as any).type = "number";
            } catch {}
            return;
          }
          try {
            if (input.selectionStart !== input.selectionEnd) {
              const len = typeof input.value === "string" ? input.value.length : 0;
              e.preventDefault();
              input.setSelectionRange(len, len);
              return;
            }
          } catch {}
        }
      } else if (e.key === "ArrowLeft" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (tagName === "input" || tagName === "textarea") {
          const input = target as HTMLInputElement | HTMLTextAreaElement;
          const isNumber = input.type === "number";
          if (isNumber) {
            try {
              e.preventDefault();
              (input as any).type = "text";
              input.setSelectionRange(0, 0);
              (input as any).type = "number";
            } catch {}
            return;
          }
          try {
            if (input.selectionStart !== input.selectionEnd) {
              e.preventDefault();
              input.setSelectionRange(0, 0);
              return;
            }
          } catch {}
        }
      }

      // Active container (Modal Dialog, Drawer/Sheet, or entire page)
      const activeModal = document.querySelector<HTMLElement>("[role='dialog']:not([aria-hidden='true'])");
      const container =
        target.closest("[role='dialog']") ||
        (activeModal && isVisible(activeModal) ? activeModal : null) ||
        target.closest("[data-slot='sheet-content']") ||
        target.closest(".sheet-content") ||
        document.body;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => isVisible(el));

      const currentIndex = focusables.indexOf(target);

      // 1. TALLY-STYLE DUAL BACKSPACE HANDLER:
      if (e.key === "Backspace" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (target.getAttribute("data-no-smart-backspace") === "true") {
          return;
        }

        let shouldNavigateBack = false;

        if (tagName === "input") {
          const input = target as HTMLInputElement;
          const val = input.value ?? "";
          const isEmpty = val.length === 0;
          let isAllSelected = false;
          try {
            isAllSelected = input.selectionStart === 0 && input.selectionEnd === val.length;
          } catch {}

          // Tally ERP: Jump back to previous field if empty OR all text is selected (without deleting)
          // Normal character deletion only happens when cursor is placed via End / Arrow keys
          if (isEmpty || isAllSelected) {
            shouldNavigateBack = true;
          } else {
            return;
          }
        } else if (tagName === "textarea") {
          const textarea = target as HTMLTextAreaElement;
          const val = textarea.value ?? "";
          const isEmpty = val.length === 0;
          let isAllSelected = false;
          try {
            isAllSelected = textarea.selectionStart === 0 && textarea.selectionEnd === val.length;
          } catch {}

          if (isEmpty || isAllSelected) {
            shouldNavigateBack = true;
          } else {
            return;
          }
        } else if (tagName === "button" || tagName === "select") {
          shouldNavigateBack = true;
        }

        // Navigate back to previous field (Shift+Tab equivalent)
        if (shouldNavigateBack && currentIndex > 0) {
          e.preventDefault();
          const prevEl = focusables[currentIndex - 1];
          prevEl.focus();
          setTimeout(() => selectAll(prevEl), 10);
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

        // Checkbox: preserve checked state and advance to next field on Enter

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
          setTimeout(() => selectAll(nextEl), 10);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("focusin", handleFocusIn, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("focusin", handleFocusIn, true);
    };
  }, []);

  return <>{children}</>;
}
