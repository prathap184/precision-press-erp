import { useEffect } from "react";

/**
 * Sets the browser tab title for client-component dashboard pages.
 * Format: "Section · Page · Hindustan Enterprises"
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Hindustan Enterprises`;
  }, [title]);
}
