import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CreditCard, MessageCircle, Phone, Copy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const message = [
    "Hello ZamPOS Team,",
    "",
    `I want to renew my subscription for ${months} month${months > 1 ? "s" : ""} (ZMW ${amount}).`,
    `Active cashiers: ${cashiers}`,
    `My Payment Code is: ${paymentCode}`,
    "",
    "Please send me mobile money payment details.",
  ].join("\n");
  return `https://wa.me/${PAYMENT_DETAILS.whatsappNumberE164}?text=${encodeURIComponent(message)}`;
};

const Subscription = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuthContext();
  const { isOnline } = useOnlineStatus();
  const { business, isLoading: bizLoading, refetch, checkSubscriptionStatus } = useBusiness(user?.id);
  const { isLocked, daysRemaining } = checkSubscriptionStatus();
  const [months, setMonths] = useState(1);
  const [activeCashiers, setActiveCashiers] = useState(0);

  useEffect(() => {
    if (!business?.id) return;
    void (async () => {
      const { count } = await supabase
        .from("business_cashiers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("is_active", true);
      setActiveCashiers(count ?? 0);
    })();
  }, [business?.id]);

  const tier = useMemo(() => resolvePricingTier(activeCashiers, business?.planTier), [activeCashiers, business?.planTier]);
  const amountZmw = months * tier.priceZmw;

  if (!authLoading && !user) {
    navigate("/auth");
    return null;
  }
  if (authLoading || bizLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
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
                <p className="font-medium">{tier.label} · ZMW {tier.priceZmw}/mo</p>
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
              <CardDescription>Choose how many months and contact us on WhatsApp to pay.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Months</p>
                <div className="grid grid-cols-4 gap-2">
                  {MONTH_OPTIONS.map((m) => (
                    <Button
                      key={m}
                      variant={months === m ? "default" : "outline"}
                      onClick={() => setMonths(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1">
                <p className="text-sm text-muted-foreground">Total ({months} × K{tier.priceZmw})</p>
                <p className="text-3xl font-display font-bold text-primary">ZMW {amountZmw}</p>
              </div>

              <Button
                variant="pos"
                className="w-full text-lg py-6"
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
                    href={`tel:${PAYMENT_DETAILS.whatsappNumberE164}`}
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
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
};

export default Subscription;
