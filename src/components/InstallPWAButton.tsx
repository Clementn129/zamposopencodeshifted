import { useEffect, useState } from "react";
import { Download, Share, Smartphone, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let savedInstallPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<(event: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    savedInstallPrompt = e as BeforeInstallPromptEvent;
    promptSubscribers.forEach((subscriber) => subscriber(savedInstallPrompt));
  });

  window.addEventListener("appinstalled", () => {
    savedInstallPrompt = null;
    promptSubscribers.forEach((subscriber) => subscriber(null));
  });
}

function isStandalone() {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true)
  );
}

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
}

function isAndroid() {
  if (typeof window === "undefined") return false;
  return /Android/i.test(window.navigator.userAgent);
}

function detectDesktopOS(): "windows" | "mac" | "linux" | "chromeos" | "other" {
  if (typeof window === "undefined") return "other";
  const ua = window.navigator.userAgent;
  if (/CrOS/i.test(ua)) return "chromeos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X/i.test(ua)) return "mac";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
}

function isPreview() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

function waitForServiceWorkerReady(ms: number) {
  if (!("serviceWorker" in navigator) || isPreview()) return Promise.resolve();
  return Promise.race([
    navigator.serviceWorker.ready.then(() => undefined).catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
}


interface Props {
  variant?: "default" | "outline" | "ghost" | "pos" | "pos-outline";
  size?: "default" | "sm" | "lg" | "xl";
  className?: string;
  label?: string;
}

export function InstallPWAButton({
  variant = "default",
  size = "default",
  className = "",
  label = "Install",
}: Props) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(savedInstallPrompt);
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    promptSubscribers.add(setPromptEvent);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      promptSubscribers.delete(setPromptEvent);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const waitForPrompt = (ms: number) =>
    new Promise<BeforeInstallPromptEvent | null>((resolve) => {
      if (promptEvent || savedInstallPrompt) return resolve(promptEvent ?? savedInstallPrompt);
      let done = false;
      const handler = (e: Event) => {
        e.preventDefault();
        if (done) return;
        done = true;
        savedInstallPrompt = e as BeforeInstallPromptEvent;
        setPromptEvent(savedInstallPrompt);
        window.removeEventListener("beforeinstallprompt", handler as EventListener);
        resolve(savedInstallPrompt);
      };
      window.addEventListener("beforeinstallprompt", handler as EventListener);
      setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("beforeinstallprompt", handler as EventListener);
        resolve(null);
      }, ms);
    });

  const handleClick = async () => {
    setInstalling(true);
    try {
      let evt = promptEvent ?? savedInstallPrompt;
      if (!evt) {
        await waitForServiceWorkerReady(1500);
        evt = await waitForPrompt(3000);
      }

      if (evt) {
        await evt.prompt();
        const { outcome } = await evt.userChoice;
        savedInstallPrompt = null;
        setPromptEvent(null);
        if (outcome === "accepted") setInstalled(true);
        return;
      }

      setShowHelp(true);
    } catch {
      setShowHelp(true);
    } finally {
      setInstalling(false);
    }
  };

  const ios = isIOS();
  const android = isAndroid();
  const desktopOS = detectDesktopOS();

  const desktopLabel =
    desktopOS === "windows" ? "On Windows (Chrome / Edge)" :
    desktopOS === "mac" ? "On Mac (Chrome / Edge)" :
    desktopOS === "linux" ? "On Linux (Chrome / Edge)" :
    desktopOS === "chromeos" ? "On Chromebook (Chrome)" :
    "On Desktop (Chrome / Edge)";

  return (
    <>
      <Button
        onClick={handleClick}
        variant={variant as any}
        size={size as any}
        className={`gap-2 ${className}`}
        disabled={installing}
      >
        <Download className="h-4 w-4" />
        {installing ? "Installing…" : label}
      </Button>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-[92vw] sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" /> Install ZamPOS
            </DialogTitle>
            <DialogDescription>
              Add ZamPOS to your home screen to use it like a native app — even offline.
            </DialogDescription>
          </DialogHeader>

          {ios ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">On iPhone / iPad (Safari):</p>
              <ol className="text-sm space-y-2 list-decimal pl-5 text-muted-foreground">
                <li>Tap the <Share className="inline h-4 w-4 text-primary" /> <strong>Share</strong> button at the bottom of Safari.</li>
                <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> in the top right.</li>
              </ol>
            </div>
          ) : android ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">On Android (Chrome):</p>
              <ol className="text-sm space-y-2 list-decimal pl-5 text-muted-foreground">
                <li>Tap the menu <strong>⋮</strong> in the top right.</li>
                <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li>Tap <strong>Install</strong> to confirm.</li>
              </ol>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Monitor className="h-4 w-4" /> {desktopLabel}:
                </p>
                <ol className="text-sm space-y-1.5 list-decimal pl-5 text-muted-foreground">
                  <li>Look for the install icon <Download className="inline h-3.5 w-3.5" /> on the right side of the address bar and click it.</li>
                  <li>Or open the browser menu and click <strong>Install ZamPOS</strong>.</li>
                  <li>Click <strong>Install</strong> to confirm.</li>
                </ol>
              </div>
              <div>
                <p className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Smartphone className="h-4 w-4" /> On a phone or tablet:
                </p>
                <ol className="text-sm space-y-1.5 list-decimal pl-5 text-muted-foreground">
                  <li>Open this page in Chrome (Android) or Safari (iPhone / iPad).</li>
                  <li>Open the browser menu and tap <strong>Add to Home Screen</strong>.</li>
                </ol>
              </div>
            </div>
          )}

          {isPreview() ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              One-tap install is disabled inside the editor preview. Open the published site
              {" "}
              <a
                href="https://zampos.lovable.app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                zampos.lovable.app
              </a>
              {" "}and tap <strong>Install</strong> there — it will open the install prompt.
            </div>
          ) : (
            <p className="text-xs text-muted-foreground border-t pt-3">
              If your browser supports one-tap install, the prompt will appear automatically. Otherwise follow the steps above.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

