import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, DollarSign, Link2, Loader2, Users, UserCheck, Wallet, CheckCircle2, Clock, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ConnectionStatus from '@/components/ConnectionStatus';
import LockScreen from '@/components/LockScreen';
import { useAuthContext } from '@/contexts/AuthContext';
import { useBusiness } from '@/hooks/useBusiness';
import { useAffiliate } from '@/hooks/useAffiliate';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const Affiliate = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuthContext();
  const { business, isLoading: bizLoading, refetch, checkSubscriptionStatus } = useBusiness(user?.id);
  const { affiliate, referrals, commissions, stats, isLoading: affLoading, becomeAffiliate, updateAffiliate, getReferralLink } = useAffiliate(user?.id);
  const { isLocked } = checkSubscriptionStatus();
  const [registering, setRegistering] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    payoutMethod: '',
    payoutNumber: '',
    payoutName: '',
  });

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [authLoading, user, navigate]);

  const handleBecomeAffiliate = async () => {
    setRegistering(true);
    const { error } = await becomeAffiliate();
    if (error) {
      toast({ variant: 'destructive', title: 'Failed', description: error.message || 'Could not register as affiliate' });
    } else {
      toast({ title: 'Welcome to the Affiliate Program!', description: 'You can now start earning commissions.' });
    }
    setRegistering(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied!', description: `${label} copied to clipboard.` });
  };

  const openEdit = () => {
    setForm({
      fullName: affiliate?.full_name || '',
      phone: affiliate?.phone || '',
      payoutMethod: affiliate?.payout_method || '',
      payoutNumber: affiliate?.payout_number || '',
      payoutName: affiliate?.payout_name || '',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateAffiliate({
      full_name: form.fullName,
      phone: form.phone,
      payout_method: form.payoutMethod,
      payout_number: form.payoutNumber,
      payout_name: form.payoutName,
    });
    setSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed', description: error.message || 'Could not update details.' });
    } else {
      toast({ title: 'Details updated', description: 'Your details have been saved.' });
      setEditOpen(false);
    }
  };

  if (authLoading || bizLoading || affLoading) {
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

  // Not yet an affiliate - show registration
  if (!affiliate) {
    return (
      <>
        <ConnectionStatus />
        <div className="min-h-screen bg-background safe-area-inset">
          <header className="bg-card border-b border-border px-4 py-4">
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-display font-bold text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" /> Affiliate Program
                </h1>
                <p className="text-xs text-muted-foreground">Earn by referring new businesses</p>
              </div>
            </div>
          </header>

          <main className="p-4 max-w-4xl mx-auto">
            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <DollarSign className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Become an Affiliate</CardTitle>
                <CardDescription className="text-base max-w-md mx-auto">
                  Earn <span className="text-primary font-semibold">20% commission</span> for every business you refer. 
                  One-time payment when they sign up.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                  <div className="bg-secondary p-4 rounded-lg">
                    <h3 className="font-semibold mb-1">1. Get Your Link</h3>
                    <p className="text-sm text-muted-foreground">Receive a unique affiliate code and referral link.</p>
                  </div>
                  <div className="bg-secondary p-4 rounded-lg">
                    <h3 className="font-semibold mb-1">2. Share & Refer</h3>
                    <p className="text-sm text-muted-foreground">Share your link with other businesses.</p>
                  </div>
                  <div className="bg-secondary p-4 rounded-lg">
                    <h3 className="font-semibold mb-1">3. Earn</h3>
                    <p className="text-sm text-muted-foreground">Get 20% of their first subscription payment.</p>
                  </div>
                </div>

                <Button variant="pos" size="lg" onClick={handleBecomeAffiliate} disabled={registering}>
                  {registering ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    'Join Affiliate Program'
                  )}
                </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      </>
    );
  }

  // Already an affiliate - show dashboard
  const referralLink = getReferralLink();

  return (
    <>
      <ConnectionStatus />
      <div className="min-h-screen bg-background safe-area-inset">
        <header className="bg-card border-b border-border px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-display font-bold text-lg flex items-center gap-2">
                <Users className="h-5 w-5" /> Affiliate Dashboard
              </h1>
              <p className="text-xs text-muted-foreground">Track your referrals and earnings</p>
            </div>
          </div>
        </header>

        <main className="p-4 max-w-4xl mx-auto space-y-4">
          {/* Affiliate Info */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Your Affiliate Details</CardTitle>
                <CardDescription>Share these with potential referrals</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Edit Details
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Affiliate ID</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={affiliate.id.substring(0, 8).toUpperCase()} readOnly className="font-mono" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(affiliate.id, 'Affiliate ID')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Affiliate Code</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={affiliate.affiliate_code} readOnly className="font-mono font-bold" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(affiliate.affiliate_code, 'Affiliate Code')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Referral Link</label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={referralLink} readOnly className="text-sm" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(referralLink, 'Referral Link')}>
                    <Link2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(affiliate.full_name || affiliate.phone) && (
                <div className="bg-secondary rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {affiliate.full_name && (
                    <div>
                      <label className="text-xs text-muted-foreground">Full Name</label>
                      <p className="text-sm font-medium">{affiliate.full_name}</p>
                    </div>
                  )}
                  {affiliate.phone && (
                    <div>
                      <label className="text-xs text-muted-foreground">Phone</label>
                      <p className="text-sm font-medium">{affiliate.phone}</p>
                    </div>
                  )}
                </div>
              )}
              {affiliate.payout_method && (
                <div className="bg-secondary rounded-lg p-3">
                  <label className="text-sm font-medium text-muted-foreground">Payout Details</label>
                  <p className="text-sm mt-1 capitalize">{affiliate.payout_method.replace('_', ' ')} • {affiliate.payout_number}</p>
                  {affiliate.payout_name && <p className="text-xs text-muted-foreground">Account Name: {affiliate.payout_name}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Referrals</p>
                    <p className="text-xl font-bold">{stats.totalReferrals}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <UserCheck className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Clients</p>
                    <p className="text-xl font-bold">{stats.activeClients}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-xl font-bold">K{stats.pendingCommission.toFixed(0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Earned</p>
                    <p className="text-xl font-bold">K{stats.totalEarnings.toFixed(0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Referrals Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Referred Businesses</CardTitle>
              <CardDescription>Businesses that signed up using your code</CardDescription>
            </CardHeader>
            <CardContent>
              {referrals.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No referrals yet. Share your link to start earning!</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referrals.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.business?.name || 'Unknown'}</TableCell>
                          <TableCell>
                            {r.business?.subscription_status === 'active' ? (
                              <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Active</Badge>
                            ) : r.business?.subscription_status === 'trial' ? (
                              <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/30">Trial</Badge>
                            ) : (
                              <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">
                                {r.business?.subscription_status || 'Unknown'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(r.created_at), 'MMM d, yyyy')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Commission History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Commission History</CardTitle>
              <CardDescription>Your earnings from referred businesses (20% one-time)</CardDescription>
            </CardHeader>
            <CardContent>
              {commissions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No commissions yet. Commissions appear when your referrals sign up.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissions.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {format(new Date(c.commission_month), 'MMMM yyyy')}
                          </TableCell>
                          <TableCell>K{Number(c.amount).toFixed(2)}</TableCell>
                          <TableCell>
                            {c.status === 'paid' ? (
                              <Badge className="bg-green-500/20 text-green-700 border-green-500/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                              </Badge>
                            ) : (
                              <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">
                                <Clock className="h-3 w-3 mr-1" /> Pending
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Edit Details Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Your Details</DialogTitle>
            <DialogDescription>
              Update your personal or payout details. Changes apply to future payouts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input id="edit-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="John Banda" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0977123456" />
            </div>
            <div className="space-y-2">
              <Label>Payout Method</Label>
              <Select value={form.payoutMethod} onValueChange={(v) => setForm({ ...form, payoutMethod: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mobile money provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="airtel_money">Airtel Money</SelectItem>
                  <SelectItem value="mtn_money">MTN Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-number">Payout Number</Label>
              <Input id="edit-number" value={form.payoutNumber} onChange={(e) => setForm({ ...form, payoutNumber: e.target.value })} placeholder="Mobile money number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-payout-name">Account Name</Label>
              <Input id="edit-payout-name" value={form.payoutName} onChange={(e) => setForm({ ...form, payoutName: e.target.value })} placeholder="Name on the account" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Affiliate;
