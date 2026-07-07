import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { useBusiness } from '@/hooks/useBusiness';
import { useBusinessType } from '@/hooks/useBusinessType';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LockScreen from '@/components/LockScreen';
import ConnectionStatus from '@/components/ConnectionStatus';
import NoticeBanner from '@/components/NoticeBanner';
import LowStockAlert from '@/components/LowStockAlert';
import DashboardNotifications from '@/components/DashboardNotifications';
import DashboardStats from '@/components/DashboardStats';

import { Store, ShoppingCart, Package, CreditCard, LogOut, Copy, Receipt, Settings as SettingsIcon, Users, Wallet, Briefcase, BarChart3, FileClock, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut, isLoading: authLoading } = useAuthContext();
  const { business, isLoading: businessLoading, refetch, checkSubscriptionStatus } = useBusiness(user?.id);
  const { labels, isService } = useBusinessType(business?.id);
  const { toast } = useToast();
  const [hasSalesToday, setHasSalesToday] = useState(false);

  const { isLocked, daysRemaining } = checkSubscriptionStatus();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!business?.id) return;
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .then(({ count }) => setHasSalesToday((count ?? 0) > 0));
  }, [business?.id]);

  usePushNotifications(
    daysRemaining,
    business?.subscriptionStatus || '',
    hasSalesToday,
    isService,
  );

  if (authLoading || businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Store className="w-12 h-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!business) return null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const copyPaymentCode = () => {
    navigator.clipboard.writeText(business.paymentCode);
    toast({ title: 'Copied!', description: 'Payment code copied' });
  };

  const getStatusBadge = () => {
    switch (business.subscriptionStatus) {
      case 'trial':
        return <Badge className="badge-trial">Trial - {daysRemaining} days left</Badge>;
      case 'active':
        return <Badge className="badge-active">Active - {daysRemaining} days left</Badge>;
      case 'expired':
        return <Badge className="badge-expired">Expired</Badge>;
      default:
        return <Badge className="badge-locked">Locked</Badge>;
    }
  };

  if (isLocked) {
    return (
      <>
        <ConnectionStatus />
        <LockScreen 
          paymentCode={business.paymentCode} 
          businessId={business.id}
          onRetrySync={refetch}
        />
      </>
    );
  }

  return (
    <>
      <ConnectionStatus />
      <div className="min-h-screen bg-background safe-area-inset">
        {/* Header */}
        <header className="bg-card border-b border-border px-4 py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Store className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display font-bold text-lg">{business.name}</h1>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{business.paymentCode}</span>
                  <button onClick={copyPaymentCode}><Copy className="w-3 h-3 text-muted-foreground" /></button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-4 max-w-4xl mx-auto space-y-4">
          {/* Notices */}
          <NoticeBanner businessId={business.id} />

          {/* Quick Stats */}
          <DashboardStats businessId={business.id} isService={isService} />

          {/* Low Stock Alerts - only for retail businesses */}
          {!isService && <LowStockAlert businessId={business.id} />}

          {/* Dashboard Notifications */}
          <DashboardNotifications
            businessId={business.id}
            daysRemaining={daysRemaining}
            subscriptionStatus={business.subscriptionStatus}
            isService={isService}
          />

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-4">
            <Link to="/pos">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                    <ShoppingCart className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold">New Sale</h3>
                  <p className="text-sm text-muted-foreground">Start selling</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/products">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-3">
                    {isService ? <Briefcase className="w-7 h-7 text-accent" /> : <Package className="w-7 h-7 text-accent" />}
                  </div>
                  <h3 className="font-semibold">{labels.productsTitle}</h3>
                  <p className="text-sm text-muted-foreground">{isService ? 'Manage services' : 'Manage stock'}</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/sales">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                    <Receipt className="w-7 h-7 text-foreground" />
                  </div>
                  <h3 className="font-semibold">Sales & Reports</h3>
                  <p className="text-sm text-muted-foreground">Sales, expenses, profit</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/debtors">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-3">
                    <Users className="w-7 h-7 text-amber-600" />
                  </div>
                  <h3 className="font-semibold">Debtors</h3>
                  <p className="text-sm text-muted-foreground">Credit sales</p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-3 gap-3">
            <Link to="/reports">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-4 text-center">
                  <BarChart3 className="w-6 h-6 text-primary mb-2" />
                  <h3 className="font-medium text-sm">Reports</h3>
                  <p className="text-xs text-muted-foreground">Sales & profit</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/cashier-activity">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-4 text-center">
                  <UserCheck className="w-6 h-6 text-primary mb-2" />
                  <h3 className="font-medium text-sm">Cashiers</h3>
                  <p className="text-xs text-muted-foreground">Activity today</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/audit-log">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-4 text-center">
                  <FileClock className="w-6 h-6 text-muted-foreground mb-2" />
                  <h3 className="font-medium text-sm">Audit Log</h3>
                  <p className="text-xs text-muted-foreground">All changes</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/subscription">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-4 text-center">
                  <CreditCard className="w-6 h-6 text-muted-foreground mb-2" />
                  <h3 className="font-medium text-sm">Subscription</h3>
                  <p className="text-xs text-muted-foreground">{daysRemaining} days left</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/affiliate">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-4 text-center">
                  <Wallet className="w-6 h-6 text-muted-foreground mb-2" />
                  <h3 className="font-medium text-sm">Affiliate</h3>
                  <p className="text-xs text-muted-foreground">Earn referrals</p>
                </CardContent>
              </Card>
            </Link>
            <Link to="/settings">
              <Card className="product-card h-full">
                <CardContent className="flex flex-col items-center justify-center p-4 text-center">
                  <SettingsIcon className="w-6 h-6 text-muted-foreground mb-2" />
                  <h3 className="font-medium text-sm">Settings</h3>
                  <p className="text-xs text-muted-foreground">Profile</p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Sign Out */}
          <Button variant="ghost" className="w-full" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </main>
      </div>
    </>
  );
};

export default Dashboard;
