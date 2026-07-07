import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, MessageCircle, Phone, Copy } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useToast } from '@/hooks/use-toast';
import { PAYMENT_DETAILS, resolvePricingTier } from '@/lib/paymentDetails';
import { supabase } from '@/integrations/supabase/client';

interface LockScreenProps {
  paymentCode: string;
  businessId?: string;
  daysExpired?: number;
  onRetrySync: () => Promise<void> | void;
  isSyncing?: boolean;
}

const MONTH_OPTIONS = [1, 3, 6, 12];

const buildWhatsAppRenewalLink = (paymentCode: string, months: number, amount: number) => {
  const message = [
    'Hello ZamPOS Team,',
    '',
    `I want to renew my subscription for ${months} month${months > 1 ? 's' : ''} (ZMW ${amount}).`,
    `My Payment Code is: ${paymentCode}`,
    '',
    'Please send me mobile money payment details.',
  ].join('\n');
  return `https://wa.me/${PAYMENT_DETAILS.whatsappNumberE164}?text=${encodeURIComponent(message)}`;
};

const LockScreen = ({ paymentCode, businessId, daysExpired = 0, onRetrySync, isSyncing }: LockScreenProps) => {
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();
  const { toast } = useToast();
  const [months, setMonths] = useState(1);
  const [activeCashiers, setActiveCashiers] = useState(0);
  const [planTier, setPlanTier] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    void (async () => {
      const { count } = await supabase
        .from('business_cashiers')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('is_active', true);
      setActiveCashiers(count ?? 0);
      const { data: biz } = await supabase
        .from('businesses')
        .select('plan_tier')
        .eq('id', businessId)
        .maybeSingle();
      setPlanTier(((biz as any)?.plan_tier as string | null) ?? null);
    })();
  }, [businessId]);

  const tier = resolvePricingTier(activeCashiers, planTier);

  const amountZmw = months * tier.priceZmw;

  const handleWhatsApp = () => {
    window.open(buildWhatsAppRenewalLink(paymentCode, months, amountZmw), '_blank');
  };

  const handlePaid = async () => {
    await onRetrySync();
    navigate('/dashboard', { replace: true });
  };

  const copyNumber = () => {
    navigator.clipboard.writeText(PAYMENT_DETAILS.whatsappDisplay);
    toast({ title: 'Copied', description: PAYMENT_DETAILS.whatsappDisplay });
  };

  return (
    <div className="lock-overlay">
      <div className="w-full max-w-md p-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        <Card className="border-destructive/30 shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 mx-auto mb-3">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <CardTitle className="text-lg text-destructive">Subscription Expired</CardTitle>
            <CardDescription className="text-sm">
              {daysExpired > 0 ? `Your subscription expired ${daysExpired} days ago` : 'Your trial has ended. Renew to continue using ZamPOS.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="text-center text-xs text-muted-foreground">
              Reference: <span className="font-mono font-semibold">{paymentCode}</span>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Months</p>
              <div className="grid grid-cols-4 gap-2">
                {MONTH_OPTIONS.map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={months === m ? 'default' : 'outline'}
                    onClick={() => setMonths(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-center space-y-1">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-display font-bold text-primary">ZMW {amountZmw}</p>
            </div>

            <Button
              variant="pos"
              className="w-full py-5"
              onClick={handleWhatsApp}
              disabled={!isOnline}
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              Renew via WhatsApp
            </Button>

            <div className="bg-secondary rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                If WhatsApp doesn't open, call or text us:
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <a
                  href={`tel:${PAYMENT_DETAILS.whatsappNumberE164}`}
                  className="inline-flex items-center gap-2 font-mono text-sm font-semibold text-primary"
                >
                  <Phone className="w-4 h-4" />
                  {PAYMENT_DETAILS.whatsappDisplay}
                </a>
                <Button variant="ghost" size="sm" onClick={copyNumber} aria-label="Copy">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={async () => { await handlePaid(); }} disabled={isSyncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Checking...' : 'I Have Paid — Check Status'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LockScreen;
