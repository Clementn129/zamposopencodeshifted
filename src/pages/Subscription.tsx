import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { ArrowLeft, CreditCard, MessageCircle, Phone, Copy, Users, Smartphone, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ConnectionStatus from "@/components/ConnectionStatus";
import LockScreen from "@/components/LockScreen";
import { useAuthContext } from "@/contexts/AuthContext";
import { useBusiness } from "@/hooks/useBusiness";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useToast } from "@/hooks/use-toast";
import { PAYMENT_DETAILS, PRICING_TIERS, resolvePricingTier } from "@/lib/paymentDetails";
import { supabase } from "@/integrations/supabase/client";

const MONTH_OPTIONS = [1, 3, 6, 12];

const buildWhatsAppRenewalLink = (paymentCode: string, months: number, amount: number, cashiers: number) => {
  const lines = [
    "Hello ZamPOS Team,",
    "",
    "I want to renew my subscription for " + months + " month" + (months > 1 ? "s" : "") + " (ZMW " + amount + ").",
    "Active cashiers: " + cashiers,
    "My Payment Code is: " + paymentCode,
    "",
    "Please send me mobile money payment details.",
  ];
  return "https://wa.me/" + PAYMENT_DETAILS.whatsappNumberE164 + "?text=" + encodeURIComponent(lines.join("\n"));
};

type PaymentState = "idle" | "initiating" | "pending" | "confirmed" | "failed" | "extending";

const Subscription = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuthContext();
  const { isOnline } = useOnlineStatus();
  const { business, isLoading: bizLoading, refetch, checkSubscriptionStatus } = useBusiness(user?.id);
  const { isLocked, daysRemaining } = checkSubscriptionStatus();
  const [months, setMonths] = useState(1);
  const [activeCashiers, setActiveCashiers] = useState(0);

  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [phone, setPhone] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!business?.id) return;
    supabase
      .from("business_cashiers")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("is_active", true)
      .then(({ count }) => setActiveCashiers(count ?? 0))
      .catch(() => {});
  }, [business?.id]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const tier = useMemo(() => resolvePricingTier(activeCashiers, business?.planTier), [activeCashiers, business?.planTier]);
  const amountZmw = months * tier.priceZmw;

  const extendSubscription = useCallback(async () => {
    if (!business?.id) {
      window.location.href = "/dashboard";
      return;
    }
    setPaymentState("extending");
    try {
      const result = await supabase.functions.invoke("extend-subscription", {
        body: { businessId: business.id, months },
      });
      console.log("extend-subscription result:", JSON.stringify(result));
      if (result.error) {
        console.error("Extend failed:", result.error);
        const { error: directErr } = await supabase
          .from("businesses")
          .update({
            subscription_status: "active",
            subscription_expires_at: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("id", business.id);
        console.log("Direct update:", directErr);
      }
    } catch (e) {
      console.error("Extend error:", e);
    }
    window.location.href = "/dashboard";
  }, [business?.id, months]);

  const pollPaymentStatus = useCallback(async (refId: string) => {
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed > 120000) {
      setPaymentState("failed");
      setPaymentError("Payment timed out. Please try again or use WhatsApp.");
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    try {
      const { data } = await supabase.functions.invoke("check-payment-status", {
        body: { referenceId: refId },
      });

      const status = data?.status;

      if (status === "Successful") {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        await extendSubscription();
      } else if (status === "Failed") {
        setPaymentState("failed");
        setPaymentError("Payment failed. Please try again.");
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    } catch {
      // Silently retry
    }
  }, [extendSubscription]);

  const handleMtnPayment = async () => {
    if (!business?.id || !phone.trim()) return;

    const formattedPhone = phone.replace(/\s/g, "");
    if (formattedPhone.length < 10) {
      setPaymentError("Please enter a valid phone number");
      return;
    }

    setPaymentState("initiating");
    setPaymentError(null);

    const refId = `lip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setReferenceId(refId);

    try {
      const response = await supabase.functions.invoke("initiate-subscription-payment", {
        body: {
          businessId: business.id,
          phone: formattedPhone,
          amount: amountZmw,
          months,
          referenceId: refId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || response.error.statusText || "Failed to initiate payment");
      }

      if (response.data?.status === "Successful") {
        await extendSubscription();
        return;
      }

      setPaymentState("pending");
      startTimeRef.current = Date.now();

      pollTimerRef.current = setInterval(() => {
        pollPaymentStatus(refId);
      }, 5000);
    } catch (err: unknown) {
      setPaymentState("failed");
      const msg = err instanceof Error ? err.message : "Failed to initiate payment";
      setPaymentError(msg);
    }
  };

  const cancelPayment = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPaymentState("idle");
    setPaymentError(null);
    setReferenceId(null);
  };

  const handlePaymentConfirmed = () => {
    window.location.href = "/dashboard";
  };

  if (!authLoading && !user) {
    navigate("/auth");
    return null;
  }
  if (authLoading || bizLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (!business) return null;

  if (isLocked) {
    return (
      <>
        <ConnectionStatus />
        <LockScreen paymentCode={business.paymentCode} businessId={business.id} onRetrySync={refetch} />
      </>
    );
  }

  const handleWhatsApp = () => {
    window.open(buildWhatsAppRenewalLink(business.paymentCode, months, amountZmw, activeCashiers), "_blank");
  };

  const copyNumber = () => {
    navigator.clipboard.writeText(PAYMENT_DETAILS.whatsappDisplay);
    toast({ title: "Copied", description: PAYMENT_DETAILS.whatsappDisplay });
  };

  const isPending = paymentState === "pending";
  const isConfirmed = paymentState === "confirmed" || paymentState === "extending";
  const isFailed = paymentState === "failed";
  const isInitiating = paymentState === "initiating";
  const isIdle = paymentState === "idle";
  const isExtending = paymentState === "extending";

  return (
    <>
      <ConnectionStatus />
      <div className="min-h-screen bg-background safe-area-inset">
        <header className="bg-card border-b border-border px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-display font-bold text-lg">Manage Subscription</h1>
                <p className="text-xs text-muted-foreground">Reference: {business.paymentCode}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refetch}>Refresh</Button>
          </div>
        </header>

        <main className="p-4 max-w-4xl mx-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Subscription Status
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Remaining days</p>
                <p className="text-2xl font-display font-bold">{daysRemaining}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Current plan</p>
                <p className="font-medium">{tier.label} - ZMW {tier.priceZmw}/mo</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end mt-1">
                  <Users className="w-3 h-3" /> {activeCashiers} active cashier{activeCashiers === 1 ? "" : "s"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plans</CardTitle>
              <CardDescription>Price scales with how many active cashiers you have.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {PRICING_TIERS.map((t) => {
                  const isCurrent = t.minCashiers === tier.minCashiers && t.maxCashiers === tier.maxCashiers;
                  return (
                    <li
                      key={t.label}
                      className={`flex items-center justify-between p-3 text-sm ${isCurrent ? "bg-primary/5" : ""}`}
                    >
                      <span className={isCurrent ? "font-semibold" : ""}>{t.label}</span>
                      <span className={isCurrent ? "font-semibold text-primary" : "text-muted-foreground"}>
                        K{t.priceZmw}/month
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Renew Subscription</CardTitle>
              <CardDescription>Choose how many months and pay via Lipila or WhatsApp.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Months</p>
                <div className="grid grid-cols-4 gap-2">
                  {MONTH_OPTIONS.map((m) => (
                    <Button
                      key={m}
                      variant={months === m ? "default" : "outline"}
                      onClick={() => { setMonths(m); cancelPayment(); }}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1">
                <p className="text-sm text-muted-foreground">Total ({months} x K{tier.priceZmw})</p>
                <p className="text-3xl font-display font-bold text-primary">ZMW {amountZmw}</p>
              </div>

              {isIdle && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sub-phone">Mobile Money Number</Label>
                    <Input
                      id="sub-phone"
                      type="tel"
                      placeholder="097 123 4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter your mobile money number. You will receive a prompt on your phone.
                    </p>
                  </div>

                  <Button
                    variant="pos"
                    className="w-full text-lg py-6"
                    onClick={handleMtnPayment}
                    disabled={!isOnline || !phone.trim()}
                  >
                    <Smartphone className="w-5 h-5 mr-2" />
                    Pay ZMW {amountZmw} via Lipila
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                </>
              )}

              {isInitiating && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Sending payment request...</p>
                </div>
              )}

              {isPending && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <div className="text-center space-y-1">
                    <p className="font-medium">Waiting for payment...</p>
                    <p className="text-sm text-muted-foreground">
                      Check your phone for the payment prompt to approve.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">Ref: {referenceId}</p>
                  <Button variant="outline" size="sm" onClick={cancelPayment}>Cancel</Button>
                </div>
              )}

              {isExtending && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 className="h-10 w-10 animate-spin text-green-500" />
                  <div className="text-center space-y-1">
                    <p className="font-medium text-green-600">Payment Successful!</p>
                    <p className="text-sm text-muted-foreground">Extending your subscription...</p>
                  </div>
                </div>
              )}

              {isConfirmed && !isExtending && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <div className="text-center space-y-1">
                    <p className="font-medium text-green-600">Payment Successful!</p>
                    <p className="text-sm text-muted-foreground">Your subscription has been extended.</p>
                  </div>
                  <Button onClick={handlePaymentConfirmed} className="w-full">
                    Continue to Dashboard
                  </Button>
                </div>
              )}

              {isFailed && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <XCircle className="h-12 w-12 text-destructive" />
                  <div className="text-center space-y-1">
                    <p className="font-medium text-destructive">Payment Failed</p>
                    {paymentError && <p className="text-sm text-muted-foreground">{paymentError}</p>}
                  </div>
                  <Button variant="outline" onClick={cancelPayment}>Try Again</Button>
                </div>
              )}

              {paymentError && !isFailed && (
                <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">{paymentError}</div>
              )}

              {isIdle && (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleWhatsApp}
                    disabled={!isOnline}
                  >
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Renew via WhatsApp
                  </Button>

                  <div className="bg-secondary rounded-lg p-3 space-y-2">
                    <p className="text-xs text-muted-foreground text-center">
                      If WhatsApp does not open, contact us directly:
                    </p>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <a
                        href={"tel:" + PAYMENT_DETAILS.whatsappNumberE164}
                        className="inline-flex items-center gap-2 font-mono text-base font-semibold text-primary"
                      >
                        <Phone className="w-4 h-4" />
                        {PAYMENT_DETAILS.whatsappDisplay}
                      </a>
                      <Button variant="ghost" size="sm" onClick={copyNumber} aria-label="Copy">
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
};

export default Subscription;
