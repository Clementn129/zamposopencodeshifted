import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getAppUrl } from '@/lib/appUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Store, Mail, Lock, User, Building2, Loader2, Phone, MapPin, ArrowLeft, Eye, EyeOff, Gift, Wallet, Briefcase } from 'lucide-react';
import { validateAffiliateCode } from '@/hooks/useAffiliate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, user, role } = useAuthContext();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Cashier login
  const [cashierCode, setCashierCode] = useState('');
  const [cashierUsername, setCashierUsername] = useState('');
  const [cashierPin, setCashierPin] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register form
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerFullName, setRegisterFullName] = useState('');
  const [registerBusinessName, setRegisterBusinessName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerAddress, setRegisterAddress] = useState('');
  const [registerBusinessType, setRegisterBusinessType] = useState('');
  const [affiliateCode, setAffiliateCode] = useState('');
  
  // Password visibility
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  // Check for referral code in URL
  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode) {
      setAffiliateCode(refCode.toUpperCase());
    }
  }, [searchParams]);

  // Redirect if already logged in
  useEffect(() => {
    if (!user) return;
    if (role === 'cashier') navigate('/pos');
    else navigate('/dashboard');
  }, [user, role, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await signIn(loginEmail, loginPassword);
      
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Login Failed',
          description: error.message || 'Invalid email or password',
        });
      } else {
        toast({
          title: 'Welcome back!',
          description: 'You have successfully logged in.',
        });
        navigate('/dashboard');
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCashierLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashierCode.trim() || !cashierUsername.trim() || !cashierPin.trim()) {
      toast({ variant: 'destructive', title: 'Missing details', description: 'Enter business code, username and PIN.' });
      return;
    }
    if (!/^\d{4,6}$/.test(cashierPin)) {
      toast({ variant: 'destructive', title: 'Invalid PIN', description: 'PIN must be 4-6 digits.' });
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-cashier', {
        body: {
          action: 'cashier_login',
          code: cashierCode.trim().toUpperCase(),
          username: cashierUsername.trim().toLowerCase(),
          pin: cashierPin,
        },
      });
      if (error) {
        throw new Error(error.message || 'Login failed');
      }
      const { email, password } = (data ?? {}) as { email?: string; password?: string };
      if (!email || !password) throw new Error('Invalid response from server');

      const { error: signInErr } = await signIn(email, password);
      if (signInErr) throw signInErr;

      toast({ title: 'Signed in', description: 'Welcome to the till.' });
      navigate('/pos');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Cashier login failed',
        description: err instanceof Error ? err.message : 'Check your business code, username and PIN.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${getAppUrl()}/auth?reset=true`,
      });

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Reset Failed',
          description: error.message,
        });
      } else {
        toast({
          title: 'Check your email',
          description: 'We sent you a password reset link. Please check your inbox.',
        });
        setShowForgotPassword(false);
        setResetEmail('');
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!registerFullName.trim() || !registerBusinessName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
      });
      setIsLoading(false);
      return;
    }

    // Validate email contains @
    if (!registerEmail.includes('@')) {
      toast({ variant: 'destructive', title: 'Invalid Email', description: 'Please enter a valid email address.' });
      setIsLoading(false);
      return;
    }

    // Validate phone is numeric (if provided)
    if (registerPhone.trim() && !/^[\d\s+()-]+$/.test(registerPhone.trim())) {
      toast({ variant: 'destructive', title: 'Invalid Phone', description: 'Phone number must contain only digits.' });
      setIsLoading(false);
      return;
    }

    // Validate affiliate code if provided
    let validAffiliateId: string | null = null;
    if (affiliateCode.trim()) {
      validAffiliateId = await validateAffiliateCode(affiliateCode.trim());
      if (!validAffiliateId) {
        toast({
          variant: 'destructive',
          title: 'Invalid Affiliate Code',
          description: 'The affiliate code you entered is not valid or inactive.',
        });
        setIsLoading(false);
        return;
      }
    }

    try {
      const { error } = await signUp(
        registerEmail, 
        registerPassword, 
        registerFullName.trim(), 
        registerBusinessName.trim(),
        registerPhone.trim() || undefined,
        registerAddress.trim() || undefined,
        validAffiliateId ? affiliateCode.trim() : undefined
      );
      
      if (error) {
        let message = error.message;
        if (error.message.includes('already registered')) {
          message = 'This email is already registered. Please login instead.';
        }
        toast({
          variant: 'destructive',
          title: 'Registration Failed',
          description: message,
        });
      } else {
        toast({
          title: 'Welcome to ZamPOS!',
          description: 'Your account and business have been created. You have a 3-day free trial.',
        });

        navigate('/dashboard');
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md animate-fade-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
              <Store className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground">ZamPOS</h1>
            <p className="text-muted-foreground mt-2">Reset your password</p>
          </div>

          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-fit mb-2"
                onClick={() => setShowForgotPassword(false)}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Login
              </Button>
              <CardTitle className="text-xl">Forgot Password</CardTitle>
              <CardDescription>
                Enter your email address and we'll send you a link to reset your password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="you@example.com"
                      className="pl-10"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <Button 
                  type="submit" 
                  variant="pos"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Store className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">ZamPOS</h1>
          <p className="text-muted-foreground mt-2">Point of Sale for Zambian Businesses</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <Tabs defaultValue={searchParams.get('tab') === 'register' ? 'register' : searchParams.get('tab') === 'cashier' ? 'cashier' : 'login'} className="w-full">
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Owner</TabsTrigger>
                <TabsTrigger value="cashier">Cashier</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
            </CardHeader>
            
            <CardContent>
              <TabsContent value="login" className="mt-0">
                <CardTitle className="text-xl mb-1">Welcome Back</CardTitle>
                <CardDescription className="mb-6">
                  Sign in to access your business dashboard
                </CardDescription>
                
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
                        className="pl-10"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot your password?
                  </button>
                  
                  <Button 
                    type="submit" 
                    variant="pos"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>

              </TabsContent>

              <TabsContent value="cashier" className="mt-0">
                <CardTitle className="text-xl mb-1">Cashier Sign In</CardTitle>
                <CardDescription className="mb-6">
                  Use the business code, your username and PIN given by the owner.
                </CardDescription>

                <form onSubmit={handleCashierLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="c-code">Business Code</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="c-code"
                        type="text"
                        placeholder="POS-XXXX"
                        className="pl-10 uppercase"
                        value={cashierCode}
                        onChange={(e) => setCashierCode(e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="c-username">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="c-username"
                        type="text"
                        placeholder="e.g. mary01"
                        className="pl-10 lowercase"
                        value={cashierUsername}
                        onChange={(e) => setCashierUsername(e.target.value.toLowerCase())}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="c-pin">PIN</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="c-pin"
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="••••"
                        className="pl-10"
                        value={cashierPin}
                        onChange={(e) => setCashierPin(e.target.value.replace(/\D/g, ''))}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" variant="pos" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</>
                    ) : 'Sign In as Cashier'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-0">
                <CardTitle className="text-xl mb-1">Create Account</CardTitle>
                <CardDescription className="mb-6">
                  Start your 3-day free trial today
                </CardDescription>
                
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="John Banda"
                        className="pl-10"
                        value={registerFullName}
                        onChange={(e) => setRegisterFullName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-business">Business Name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-business"
                        type="text"
                        placeholder="My Shop"
                        className="pl-10"
                        value={registerBusinessName}
                        onChange={(e) => setRegisterBusinessName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        className="pl-10"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-password"
                        type={showRegisterPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showRegisterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-phone">Phone Number (Optional)</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-phone"
                        type="tel"
                        placeholder="+260 97 123 4567"
                        className="pl-10"
                        value={registerPhone}
                        onChange={(e) => setRegisterPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-address">Business Address (Optional)</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-address"
                        type="text"
                        placeholder="123 Main Street, Lusaka"
                        className="pl-10"
                        value={registerAddress}
                        onChange={(e) => setRegisterAddress(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-business-type">Business Type</Label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                      <Select value={registerBusinessType} onValueChange={setRegisterBusinessType}>
                        <SelectTrigger className="pl-10">
                          <SelectValue placeholder="Select business type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="retail">Retail / Shop</SelectItem>
                          <SelectItem value="service">Service Business</SelectItem>
                          <SelectItem value="hybrid">Both (Products & Services)</SelectItem>
                          <SelectItem value="restaurant">Restaurant / Food</SelectItem>
                          <SelectItem value="wholesale">Wholesale</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-affiliate">Affiliate Code (Optional)</Label>
                    <div className="relative">
                      <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-affiliate"
                        type="text"
                        placeholder="e.g., ZAM-ABC123"
                        className="pl-10 uppercase"
                        value={affiliateCode}
                        onChange={(e) => setAffiliateCode(e.target.value.toUpperCase())}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Have a referral code? Enter it here.</p>
                  </div>
                  
                  <Button 
                    type="submit" 
                    variant="pos-accent"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Start Free Trial'
                    )}
                  </Button>
                </form>
                
                <p className="text-xs text-muted-foreground text-center mt-4">
                  3 days free, then ZMW 100/month
                </p>

                <div className="mt-4 pt-4 border-t border-border text-center">
                  <p className="text-sm text-muted-foreground mb-2">Want to earn by referring businesses?</p>
                  <Button variant="outline" className="w-full" onClick={() => navigate('/affiliate-auth')}>
                    <Wallet className="h-4 w-4 mr-2" /> Become an Affiliate
                  </Button>
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
