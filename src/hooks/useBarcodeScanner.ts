import { useEffect, useRef } from "react";

/**
 * Global barcode scanner listener.
 *
 * USB and Bluetooth barcode scanners act as keyboard "wedges" — they type
 * the scanned characters extremely fast (much faster than a human) and
 * usually end with Enter. We detect rapid keystrokes globally; if at least
 * `minLength` characters land within `maxIntervalMs` between keys and end
 * with Enter, we treat the accumulated string as a scanned barcode.
 *
 * This works with virtually any keyboard-emulating barcode scanner, no
 * driver, pairing UI, or device permission needed.
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  options?: {
    enabled?: boolean;
    minLength?: number;       // min chars to accept (default 4)
    maxIntervalMs?: number;   // max gap between chars (default 50ms)
  }
) {
  const enabled = options?.enabled !== false;
  const minLength = options?.minLength ?? 4;
  const maxInterval = options?.maxIntervalMs ?? 50;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastTime = 0;

    const handler = (e: KeyboardEvent) => {
      // Ignore when user is typing in an input/textarea/contenteditable
      // unless the input is explicitly marked as a scanner target.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable;
      const scannerOptIn = target?.dataset?.scannerTarget === "true";
      if (isEditable && !scannerOptIn) {
        buffer = "";
        return;
      }

      const now = Date.now();
      if (now - lastTime > maxInterval) buffer = "";
      lastTime = now;

      if (e.key === "Enter") {
        if (buffer.length >= minLength) {
          e.preventDefault();
          const code = buffer;
          buffer = "";
          onScanRef.current(code);
        } else {
          buffer = "";
        }
        return;
      }

      // Only printable single chars
      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [enabled, minLength, maxInterval]);
}
