import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PWA Update Prompt
 *
 * Detects when a new service worker version is available and prompts the
 * user to reload. It intentionally does not poll or auto-activate updates
 * because that can interrupt POS usage with unexpected refreshes.
 *
 * This is the standard fix for the "I have to uninstall / clear cache to
 * see updates" PWA problem.
 */
export const PWAUpdatePrompt = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // Skip in iframe/preview contexts
    const isInIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    const isPreviewHost =
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");

    if (isInIframe || isPreviewHost || !import.meta.env.PROD) return;

    let cancelled = false;
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        if (cancelled) return;

        const updater = registerSW({
          onNeedRefresh() {
            setNeedRefresh(true);
          },
        });

        setUpdateSW(() => updater);
      })
      .catch((err) => console.warn("PWA register failed:", err));

    return () => {
      cancelled = true;
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card/95 p-4 shadow-2xl backdrop-blur-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <RefreshCw className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            New version available
          </p>
          <p className="text-xs text-muted-foreground">
            Reload to get the latest features and fixes.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => updateSW?.(true)}
          className="shrink-0"
        >
          Reload
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
