import { useEffect, useRef } from "react";

/**
 * Global barcode scanner listener.
 *
 * USB and Bluetooth barcode scanners act as keyboard "wedges" — they type
 * the scanned characters extremely fast (much faster than a human) and may
 * or may not end with Enter (many budget scanners have no Enter suffix).
 * We detect rapid keystrokes globally:
 *  - chars accumulate while the gap between keys stays within `maxIntervalMs`
 *  - a code is dispatched when it is at least `minLength` chars AND either
 *    an Enter arrives or no key lands within `idleMs` (so scanners without
 *    an Enter suffix still work automatically)
 *
 * This works with virtually any keyboard-emulating barcode scanner, no
 * driver, pairing UI, or device permission needed.
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  options?: {
    enabled?: boolean;
    minLength?: number;       // min chars to accept (default 4)
    maxIntervalMs?: number;   // max gap between chars (default 300ms — tolerant of Bluetooth latency)
    idleMs?: number;          // auto-fire after this silence once a full code is buffered (default 120ms)
  }
) {
  const enabled = options?.enabled !== false;
  const minLength = options?.minLength ?? 4;
  const maxInterval = options?.maxIntervalMs ?? 300;
  const idleMs = options?.idleMs ?? 120;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastTime = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const clearIdle = () => {
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const fireIfReady = () => {
      if (buffer.length < minLength) return;
      const code = buffer;
      buffer = "";
      clearIdle();
      onScanRef.current(code);
    };

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
        clearIdle();
        buffer = "";
        return;
      }

      clearIdle();

      const now = Date.now();
      if (now - lastTime > maxInterval) buffer = "";
      lastTime = now;

      if (e.key === "Enter") {
        e.preventDefault();
        fireIfReady();
        return;
      }

      // Only printable single chars
      if (e.key.length === 1) {
        buffer += e.key;
        if (buffer.length >= minLength) {
          // Auto-fire once the scanner falls silent for `idleMs` — covers
          // scanners configured without an Enter suffix.
          idleTimer = setTimeout(() => fireIfReady(), idleMs);
        }
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => {
      clearIdle();
      window.removeEventListener("keydown", handler, true);
    };
  }, [enabled, minLength, maxInterval, idleMs]);
}