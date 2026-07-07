import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, Clock, DollarSign, Users, UserCheck, XCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface AffiliateWithProfile {
  id: string;
  user_id: string;
  affiliate_code: string;
  status: 'pending' | 'active' | 'suspended';
  total_earnings: number;
  created_at: string;
  full_name?: string | null;
  phone?: string | null;
  payout_method?: string | null;
  payout_number?: string | null;
  payout_name?: string | null;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface ReferralWithBusiness {
  id: string;
  affiliate_id: string;
  business_id: string;
  created_at: string;
  business: {
    id: string;
    name: string;
    subscription_status: 'trial' | 'active' | 'expired' | 'locked';
  };
}

interface Commission {
  id: string;
  affiliate_id: string;
  referral_id: string;
  amount: number;
  commission_month: string;
  status: 'pending' | 'paid';
  paid_at: string | null;
}

const COMMISSION_RATE = 0.30; // 30%
const SUBSCRIPTION_PRICE = 100; // ZMW

const AdminAffiliatePanel = () => {
  const { toast } = useToast();
  const [affiliates, setAffiliates] = useState<AffiliateWithProfile[]>([]);
  const [referrals, setReferrals] = useState<ReferralWithBusiness[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliateWithProfile | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch affiliates
      const { data: affData, error: affErr } = await supabase
        .from('affiliates')
        .select('*')
        .order('created_at', { ascending: false });

      if (affErr) throw affErr;

      // Fetch profiles for affiliates
      const userIds = (affData || []).map((a: any) => a.user_id);
      const { data: profData } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);

      const affiliatesWithProfiles: AffiliateWithProfile[] = (affData || []).map((a: any) => ({
        ...a,
        profile: profData?.find(p => p.user_id === a.user_id),
      }));
      setAffiliates(affiliatesWithProfiles);

      // Fetch all referrals
      const { data: refData, error: refErr } = await supabase
        .from('affiliate_referrals')
        .select(`
          id,
          affiliate_id,
          business_id,
          created_at,
          businesses:business_id (
            id,
            name,
            subscription_status
          )
        `);

      if (refErr) throw refErr;

      const mappedReferrals: ReferralWithBusiness[] = (refData || []).map((r: any) => ({
        id: r.id,
        affiliate_id: r.affiliate_id,
        business_id: r.business_id,
        created_at: r.created_at,
        business: r.businesses,
      }));
      setReferrals(mappedReferrals);

      // Fetch all commissions
      const { data: commData, error: commErr } = await supabase
        .from('affiliate_commissions')
        .select('*')
        .order('commission_month', { ascending: false });

      if (commErr) throw commErr;
      setCommissions((commData || []) as Commission[]);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not load affiliate data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAffiliateReferrals = (affiliateId: string) => {
    return referrals.filter(r => r.affiliate_id === affiliateId);
  };

  const getAffiliateCommissions = (affiliateId: string) => {
    return commissions.filter(c => c.affiliate_id === affiliateId);
  };

  const getActiveClients = (affiliateId: string) => {
    return getAffiliateReferrals(affiliateId).filter(r => r.business?.subscription_status === 'active').length;
  };

  const getPendingCommission = (affiliateId: string) => {
    return getAffiliateCommissions(affiliateId)
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + Number(c.amount), 0);
  };

  const markCommissionPaid = async (commission: Commission) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('affiliate_commissions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: user.id,
        })
        .eq('id', commission.id);

      if (error) throw error;

      // Update affiliate's total earnings
      const affiliate = affiliates.find(a => a.id === commission.affiliate_id);
      if (affiliate) {
        await supabase
          .from('affiliates')
          .update({
            total_earnings: Number(affiliate.total_earnings) + Number(commission.amount),
          })
          .eq('id', affiliate.id);
      }

      toast({ title: 'Marked as Paid' });
      await fetchData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not update' });
    }
  };

  const generateMonthlyCommissions = async () => {
    try {
      const currentMonth = new Date();
      currentMonth.setDate(1);
      const monthStr = format(currentMonth, 'yyyy-MM-dd');

      // Get all active referrals
      const activeReferrals = referrals.filter(r => r.business?.subscription_status === 'active');

      let created = 0;
      for (const referral of activeReferrals) {
        // Check if commission already exists for this month
        const existing = commissions.find(
          c => c.referral_id === referral.id && c.commission_month === monthStr
        );

        if (!existing) {
          const { error } = await supabase
            .from('affiliate_commissions')
            .insert({
              affiliate_id: referral.affiliate_id,
              referral_id: referral.id,
              amount: SUBSCRIPTION_PRICE * COMMISSION_RATE,
              commission_month: monthStr,
              status: 'pending',
            });

          if (!error) created++;
        }
      }

      toast({ title: 'Commissions Generated', description: `Created ${created} new commission records.` });
      await fetchData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not generate' });
    }
  };

  const toggleAffiliateStatus = async (affiliate: AffiliateWithProfile) => {
    try {
      const newStatus = affiliate.status === 'active' ? 'suspended' : 'active';
      const { error } = await supabase
        .from('affiliates')
        .update({ status: newStatus })
        .eq('id', affiliate.id);

      if (error) throw error;
      toast({ title: newStatus === 'active' ? 'Affiliate Activated' : 'Affiliate Suspended' });
      await fetchData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not update' });
    }
  };

  const deleteAffiliate = async (affiliate: AffiliateWithProfile) => {
    const name = affiliate.full_name || affiliate.profile?.full_name || 'this affiliate';
    if (!confirm(`Are you sure you want to delete "${name}"? This will remove all their referrals and commission records. This cannot be undone!`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('affiliates')
        .delete()
        .eq('id', affiliate.id);

      if (error) throw error;
      toast({ title: 'Affiliate Deleted', description: `${name} has been permanently removed.` });
      await fetchData();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not delete' });
    }
  };

  const stats = useMemo(() => {
    const totalAffiliates = affiliates.length;
    const activeAffiliates = affiliates.filter(a => a.status === 'active').length;
    const totalReferrals = referrals.length;
    const pendingPayout = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + Number(c.amount), 0);

    return { totalAffiliates, activeAffiliates, totalReferrals, pendingPayout };
  }, [affiliates, referrals, commissions]);

  if (loading) {
    return <p className="text-muted-foreground p-4">Loading affiliates…</p>;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Affiliates</p>
                <p className="text-xl font-bold">{stats.totalAffiliates}</p>
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
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{stats.activeAffiliates}</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Payout</p>
                <p className="text-xl font-bold">K{stats.pendingPayout.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="pos" onClick={generateMonthlyCommissions}>
          <DollarSign className="h-4 w-4 mr-2" /> Generate Monthly Commissions
        </Button>
      </div>

      {/* Affiliates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Affiliates</CardTitle>
          <CardDescription>All registered affiliates and their performance</CardDescription>
        </CardHeader>
        <CardContent>
          {affiliates.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No affiliates registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affiliate</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Referrals</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Total Earned</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affiliates.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{a.full_name || a.profile?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{a.profile?.email}</p>
                          {a.payout_method && (
                            <p className="text-xs text-muted-foreground">
                              {a.payout_method.replace('_', ' ')} • {a.payout_number}
                              {a.payout_name ? ` (${a.payout_name})` : ''}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{a.affiliate_code}</TableCell>
                      <TableCell>
                        {a.status === 'active' ? (
                          <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Active</Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-700 border-red-500/30">Suspended</Badge>
                        )}
                      </TableCell>
                      <TableCell>{getAffiliateReferrals(a.id).length}</TableCell>
                      <TableCell>{getActiveClients(a.id)}</TableCell>
                      <TableCell>K{getPendingCommission(a.id).toFixed(0)}</TableCell>
                      <TableCell>K{Number(a.total_earnings).toFixed(0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" onClick={() => setSelectedAffiliate(a)}>
                                View
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>
                                  {a.profile?.full_name || 'Affiliate'} - Details
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <h4 className="font-semibold mb-2">Referred Businesses</h4>
                                  {getAffiliateReferrals(a.id).length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No referrals yet</p>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Business</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Joined</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {getAffiliateReferrals(a.id).map(r => (
                                          <TableRow key={r.id}>
                                            <TableCell>{r.business?.name}</TableCell>
                                            <TableCell>
                                              {r.business?.subscription_status === 'active' ? (
                                                <Badge className="bg-green-500/20 text-green-700 border-green-500/30">Active</Badge>
                                              ) : (
                                                <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">
                                                  {r.business?.subscription_status}
                                                </Badge>
                                              )}
                                            </TableCell>
                                            <TableCell>{format(new Date(r.created_at), 'MMM d, yyyy')}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </div>
                                <div>
                                  <h4 className="font-semibold mb-2">Commissions</h4>
                                  {getAffiliateCommissions(a.id).length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No commissions yet</p>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Month</TableHead>
                                          <TableHead>Amount</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead>Action</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {getAffiliateCommissions(a.id).map(c => (
                                          <TableRow key={c.id}>
                                            <TableCell>{format(new Date(c.commission_month), 'MMMM yyyy')}</TableCell>
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
                                            <TableCell>
                                              {c.status === 'pending' && (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => markCommissionPaid(c)}
                                                >
                                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
                                                </Button>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleAffiliateStatus(a)}
                          >
                            {a.status === 'active' ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteAffiliate(a)}
                            title="Delete affiliate"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAffiliatePanel;
