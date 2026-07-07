import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Store, Mail, Lock, User, Phone, ArrowLeft, Eye, EyeOff, Loader2, Wallet } from 'lucide-react';

const AffiliateAuth = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp } = useAuthContext();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState('');
  const [payoutNumber, setPayoutNumber] = useState('');
  const [payoutName, setPayoutName] = useState('');

  // Redirect if already logged in and is an affiliate
  useEffect(() => {
    if (user) {
      // Check if they're already an affiliate
      const checkAffiliate = async () => {
        const { data } = await supabase
          .from('affiliates')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data) {
          navigate('/affiliate');
        }
      };
      checkAffiliate();
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await signIn(loginEmail, loginPassword);
      if (error) {
        toast({ variant: 'destructive', title: 'Login Failed', description: error.message });
      } else {
        // Check if this user is an affiliate
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user) {
          const { data: affData } = await supabase
            .from('affiliates')
            .select('id')
            .eq('user_id', session.session.user.id)
            .maybeSingle();

          if (affData) {
            toast({ title: 'Welcome back!', description: 'Redirecting to your affiliate dashboard.' });
            navigate('/affiliate');
          } else {
            toast({ variant: 'destructive', title: 'Not an Affiliate', description: 'This account is not registered as an affiliate. Please register first.' });
            await supabase.auth.signOut();
          }
        }
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Something went wrong.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!fullName.trim() || !payoutMethod) {
      toast({ variant: 'destructive', title: 'Missing Info', description: 'Please fill in all required fields.' });
      setIsLoading(false);
      return;
    }

    if (payoutMethod && !payoutNumber.trim()) {
      toast({ variant: 'destructive', title: 'Missing Info', description: 'Please enter your mobile money number.' });
      setIsLoading(false);
      return;
    }

    try {
      // Sign up the user (they get a business_owner role + business by default from the trigger)
      const { error } = await signUp(email, password, fullName.trim(), 'Affiliate Account');

      if (error) {
        let message = error.message;
        if (error.message.includes('already registered')) {
          message = 'This email is already registered. Please login instead.';
        }
        toast({ variant: 'destructive', title: 'Registration Failed', description: message });
        setIsLoading(false);
        return;
      }

      // Wait for the account to be created, then create affiliate profile
      setTimeout(async () => {
        try {
          const { data: session } = await supabase.auth.getSession();
          if (session?.session?.user) {
            // Generate affiliate code
            const { data: codeData, error: codeErr } = await supabase.rpc('generate_affiliate_code');
            if (codeErr) throw codeErr;

            const { error: affErr } = await supabase
              .from('affiliates')
              .insert({
                user_id: session.session.user.id,
                affiliate_code: codeData,
                status: 'active',
                full_name: fullName.trim(),
                phone: phone.trim() || null,
                payout_method: payoutMethod,
                payout_number: payoutNumber.trim(),
                payout_name: payoutName.trim() || null,
              });

            if (affErr) throw affErr;

            toast({ title: 'Welcome to the Affiliate Program!', description: 'Your account has been created.' });
            navigate('/affiliate');
          }
        } catch (err: any) {
          console.error('Error creating affiliate profile:', err);
          toast({ variant: 'destructive', title: 'Error', description: 'Account created but affiliate setup failed. Please contact support.' });
        }
      }, 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Something went wrong.' });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Wallet className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">ZamPOS Affiliates</h1>
          <p className="text-muted-foreground mt-2">Earn K30 per active client every month</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <Tabs defaultValue="register" className="w-full">
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              {/* LOGIN TAB */}
              <TabsContent value="login" className="mt-0">
                <CardTitle className="text-xl mb-1">Affiliate Login</CardTitle>
                <CardDescription className="mb-6">Sign in to your affiliate dashboard</CardDescription>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="aff-login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="aff-login-email" type="email" placeholder="you@example.com" className="pl-10" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aff-login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="aff-login-password" type={showLoginPassword ? 'text' : 'password'} placeholder="••••••••" className="pl-10 pr-10" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required minLength={6} />
                      <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" variant="pos" className="w-full" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : 'Sign In'}
                  </Button>
                </form>
              </TabsContent>

              {/* REGISTER TAB */}
              <TabsContent value="register" className="mt-0">
                <CardTitle className="text-xl mb-1">Become an Affiliate</CardTitle>
                <CardDescription className="mb-6">
                  Earn <span className="text-primary font-semibold">K30/month</span> for every active paying client you refer
                </CardDescription>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="aff-name">Full Name *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="aff-name" placeholder="John Banda" className="pl-10" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="aff-email">Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="aff-email" type="email" placeholder="you@example.com" className="pl-10" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="aff-phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="aff-phone" type="tel" placeholder="+260 97 123 4567" className="pl-10" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="aff-password">Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="aff-password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="pl-10 pr-10" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4 space-y-4">
                    <p className="text-sm font-medium text-foreground">Payout Details</p>

                    <div className="space-y-2">
                      <Label htmlFor="aff-payout">Payout Method *</Label>
                      <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payout method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="airtel_money">Airtel Money</SelectItem>
                          <SelectItem value="mtn_money">MTN Money</SelectItem>
                          <SelectItem value="zamtel_money">Zamtel Money</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {payoutMethod && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="aff-payout-number">Mobile Money Number *</Label>
                          <Input id="aff-payout-number" type="tel" placeholder="e.g. 097 123 4567" value={payoutNumber} onChange={(e) => setPayoutNumber(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="aff-payout-name">Name on Account</Label>
                          <Input id="aff-payout-name" placeholder="Name that appears on payment" value={payoutName} onChange={(e) => setPayoutName(e.target.value)} />
                        </div>
                      </>
                    )}
                  </div>

                  <Button type="submit" variant="pos" className="w-full" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</> : 'Join Affiliate Program'}
                  </Button>
                </form>

                <p className="text-xs text-muted-foreground text-center mt-4">
                  30% recurring commission (K30) per active client
                </p>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <div className="text-center mt-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to ZamPOS
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AffiliateAuth;
