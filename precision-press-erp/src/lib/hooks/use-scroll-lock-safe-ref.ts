import { useCallback, useRef } from "react";

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref != null) (ref as React.MutableRefObject<T | null>).current = value;
}

/**
 * Returns a stable ref callback that keeps a portaled, scrollable element
 * scrollable while a Radix Dialog / Sheet is open.
 */
export function useScrollLockSafeRef<T extends HTMLElement = HTMLElement>(
  externalRef?: React.Ref<T>
) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!node) return;

    const stop = (event: Event) => event.stopPropagation();
    node.addEventListener("wheel", stop, { passive: true });
    node.addEventListener("touchmove", stop, { passive: true });

    cleanupRef.current = () => {
      node.removeEventListener("wheel", stop);
      node.removeEventListener("touchmove", stop);
    };
  }, []);

  return useCallback(
    (node: T | null) => {
      attach(node);
      setRef(externalRef, node);
    },
    [attach, externalRef]
  );
}
