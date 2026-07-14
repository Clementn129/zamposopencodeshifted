import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, RefreshCw, MessageCircle, Phone, Copy, Loader2, CheckCircle2, XCircle, Smartphone } from 'lucide-react';
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

type PaymentState = 'idle' | 'initiating' | 'pending' | 'confirmed' | 'failed' | 'extending';

const LockScreen = ({ paymentCode, businessId, daysExpired = 0, onRetrySync, isSyncing }: LockScreenProps) => {
  const { isOnline } = useOnlineStatus();
  const { toast } = useToast();
  const [months, setMonths] = useState(1);
  const [activeCashiers, setActiveCashiers] = useState(0);
  const [planTier, setPlanTier] = useState<string | null>(null);

  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [phone, setPhone] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

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

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleWhatsApp = () => {
    window.open(buildWhatsAppRenewalLink(paymentCode, months, amountZmw), '_blank');
  };

  const copyNumber = () => {
    navigator.clipboard.writeText(PAYMENT_DETAILS.whatsappDisplay);
    toast({ title: 'Copied', description: PAYMENT_DETAILS.whatsappDisplay });
  };

  // Extend subscription and navigate to dashboard
  const extendAndNavigate = useCallback(async () => {
    if (!businessId) {
      window.location.href = '/dashboard';
      return;
    }

    setPaymentState('extending');

    try {
      const result = await supabase.functions.invoke('extend-subscription', {
        body: { businessId, months },
      });

      console.log('extend-subscription result:', JSON.stringify(result));

      if (result.error) {
        console.error('Extend failed:', result.error);
        // Try direct update as fallback
          const { error: directErr } = await supabase
            .from('businesses')
            .update({
              subscription_status: 'active',
              subscription_expires_at: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString(),
              is_locked: false,
            })
            .eq('id', businessId);
        console.log('Direct update result:', directErr);
      }
    } catch (e) {
      console.error('Extend error:', e);
    }

    // Hard reload to dashboard - forces fresh data fetch
    window.location.href = '/dashboard';
  }, [businessId, months]);

  const pollPaymentStatus = useCallback(async (refId: string) => {
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed > 120000) {
      setPaymentState('failed');
      setPaymentError('Payment timed out. Please try again or use WhatsApp.');
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('check-payment-status', {
        body: { referenceId: refId },
      });

      const status = data?.status;

      if (status === 'Successful') {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        await extendAndNavigate();
      } else if (status === 'Failed') {
        setPaymentState('failed');
        setPaymentError('Payment failed. Please try again.');
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    } catch {
      // Silently retry
    }
  }, [extendAndNavigate]);

  const handleMtnPayment = async () => {
    if (!businessId || !phone.trim()) return;

    const formattedPhone = phone.replace(/\s/g, '');
    if (formattedPhone.length < 10) {
      setPaymentError('Please enter a valid phone number');
      return;
    }

    setPaymentState('initiating');
    setPaymentError(null);

    const refId = `mtn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    setReferenceId(refId);

    try {
      const response = await supabase.functions.invoke('initiate-subscription-payment', {
        body: {
          businessId,
          phone: formattedPhone,
          amount: amountZmw,
          months,
          referenceId: refId,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || response.error.statusText || 'Failed to initiate payment');
      }

      // Edge Function may have already confirmed payment (sandbox auto-approves)
      if (response.data?.status === 'Successful') {
        await extendAndNavigate();
        return;
      }

      setPaymentState('pending');
      startTimeRef.current = Date.now();

      pollTimerRef.current = setInterval(() => {
        pollPaymentStatus(refId);
      }, 5000);
    } catch (err: unknown) {
      setPaymentState('failed');
      const msg = err instanceof Error ? err.message : 'Failed to initiate payment';
      setPaymentError(msg);
    }
  };

  const cancelPayment = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPaymentState('idle');
    setPaymentError(null);
    setReferenceId(null);
  };

  const isPending = paymentState === 'pending';
  const isConfirmed = paymentState === 'confirmed' || paymentState === 'extending';
  const isFailed = paymentState === 'failed';
  const isInitiating = paymentState === 'initiating';
  const isIdle = paymentState === 'idle';
  const isExtending = paymentState === 'extending';

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
                    onClick={() => { setMonths(m); cancelPayment(); }}
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
                  className="w-full py-5"
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

            {isFailed && (
              <div className="flex flex-col items-center gap-3 py-4">
                <XCircle className="h-12 w-12 text-destructive" />
                <div className="text-center space-y-1">
                  <p className="font-medium text-destructive">Payment Failed</p>
                  {paymentError && (
                    <p className="text-sm text-muted-foreground">{paymentError}</p>
                  )}
                </div>
                <Button variant="outline" onClick={cancelPayment}>Try Again</Button>
              </div>
            )}

            {paymentError && !isFailed && (
              <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                {paymentError}
              </div>
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

                <Button variant="outline" className="w-full" onClick={async () => { window.location.href = '/dashboard'; }} disabled={isSyncing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Checking...' : 'I Have Paid — Check Status'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LockScreen;
