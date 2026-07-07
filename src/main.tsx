import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service worker is registered inside <PWAUpdatePrompt /> (mounted in App)
// so we can show a "New version available" toast and auto-reload.
// Here we only clean up stale SWs in preview/iframe contexts.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

if (isInIframe && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

// ---------------------------------------------------------------------------
// White-screen recovery for stale service worker deploys.
//
// After a new deploy (Vercel/Lovable), an old service worker can still serve
// a cached index.html that references hashed JS chunks which no longer exist.
// The dynamic import then fails ("Failed to fetch dynamically imported
// module" / "ChunkLoadError") and React never mounts → white screen on
// Chrome / Edge, especially after login when a lazy route loads.
//
// When we detect this specific error class we unregister every service
// worker, purge caches, and force a one-time hard reload. Guarded by a
// sessionStorage flag so we never loop.
// ---------------------------------------------------------------------------
const RELOAD_FLAG = "zampos:sw-recovery-reload";

const looksLikeChunkLoadError = (msg: string | undefined | null): boolean => {
  if (!msg) return false;
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
};

const recoverFromStaleServiceWorker = async () => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried this session
    sessionStorage.setItem(RELOAD_FLAG, "1");

    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore — we still want to reload
  } finally {
    window.location.reload();
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (looksLikeChunkLoadError(event?.message)) {
      void recoverFromStaleServiceWorker();
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const msg =
      typeof reason === "string"
        ? reason
        : reason && typeof reason.message === "string"
          ? reason.message
          : "";
    if (looksLikeChunkLoadError(msg)) {
      void recoverFromStaleServiceWorker();
    }
  });
}

