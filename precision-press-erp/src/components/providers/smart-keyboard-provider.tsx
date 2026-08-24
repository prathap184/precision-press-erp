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
  '[contenteditable="true"]',
  'button:not([disabled]):not([tabindex="-1"])',
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
      if (e.key !== "Backspace" || e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }

      const target = document.activeElement as HTMLElement | null;
      if (!target) return;

      const tagName = target.tagName.toLowerCase();
      let shouldNavigateBack = false;

      if (tagName === "input") {
        const input = target as HTMLInputElement;
        const inputType = (input.type || "text").toLowerCase();

        // Non-text input types (checkbox, radio, button, submit, etc.)
        if (["checkbox", "radio", "submit", "button", "reset", "image", "color"].includes(inputType)) {
          shouldNavigateBack = true;
        } else {
          // For text, number, search, date, etc.
          const val = input.value ?? "";
          const hasSelection =
            input.selectionStart !== null &&
            input.selectionEnd !== null &&
            input.selectionStart !== input.selectionEnd;

          // If the field is empty, or cursor is at position 0 with no text selected to delete:
          if (!hasSelection && (val === "" || input.selectionStart === 0)) {
            shouldNavigateBack = true;
          }
        }
      } else if (tagName === "select") {
        shouldNavigateBack = true;
      } else if (tagName === "textarea") {
        const textarea = target as HTMLTextAreaElement;
        const val = textarea.value ?? "";
        const hasSelection =
          textarea.selectionStart !== null &&
          textarea.selectionEnd !== null &&
          textarea.selectionStart !== textarea.selectionEnd;

        // Only navigate back if the textarea is completely empty
        if (!hasSelection && val === "" && textarea.selectionStart === 0) {
          shouldNavigateBack = true;
        }
      } else if (target.getAttribute("role") === "combobox" || target.getAttribute("role") === "button") {
        shouldNavigateBack = true;
      }

      if (!shouldNavigateBack) return;

      // Find the closest active container (Modal, Drawer, Sheet, Form, or Main body)
      const container =
        target.closest("[role='dialog']") ||
        target.closest("[data-slot='sheet-content']") ||
        target.closest(".sheet-content") ||
        target.closest("form") ||
        target.closest("main") ||
        document.body;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => isVisible(el));

      const currentIndex = focusables.indexOf(target);
      if (currentIndex > 0) {
        e.preventDefault();
        const prevEl = focusables[currentIndex - 1];
        prevEl.focus();

        // If the previous element is an input, place cursor at the end or select content
        if (prevEl instanceof HTMLInputElement || prevEl instanceof HTMLTextAreaElement) {
          try {
            const len = prevEl.value.length;
            prevEl.setSelectionRange(len, len);
          } catch {
            try {
              prevEl.select();
            } catch {
              // Ignore if select not supported
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
