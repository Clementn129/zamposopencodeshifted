import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Users, DollarSign, Check, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConnectionStatus from '@/components/ConnectionStatus';
import OfflineBanner from '@/components/OfflineBanner';
import LockScreen from '@/components/LockScreen';
import { useAuthContext } from '@/contexts/AuthContext';
import { useBusiness } from '@/hooks/useBusiness';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cacheDebtors, getCachedDebtors, updateCachedDebtor } from '@/lib/offlineStorage';

type Debtor = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  amountOwed: number;
  amountPaid: number;
  status: 'unpaid' | 'partially_paid' | 'paid';
  notes: string | null;
  createdAt: string;
};

type DebtorPayment = {
  id: string;
  amount: number;
  paymentDate: string;
  notes: string | null;
};

const Debtors = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuthContext();
  const { business, isLoading: bizLoading, refetch: refetchBusiness, checkSubscriptionStatus } = useBusiness(user?.id);
  const { isLocked } = checkSubscriptionStatus();
  const { isOnline } = useOnlineStatus();

  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [payments, setPayments] = useState<DebtorPayment[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('unpaid');

  // Add debtor form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [amountOwed, setAmountOwed] = useState('');
  const [notes, setNotes] = useState('');

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [authLoading, user, navigate]);

  const fetchDebtors = async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      if (isOnline) {
        const { data, error } = await supabase
          .from('debtors')
          .select('*')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mappedDebtors = (data || []).map((d: any) => ({
          id: d.id,
          customerName: d.customer_name,
          customerPhone: d.customer_phone,
          amountOwed: Number(d.amount_owed),
          amountPaid: Number(d.amount_paid),
          status: d.status as 'unpaid' | 'partially_paid' | 'paid',
          notes: d.notes,
          createdAt: d.created_at,
        }));
        setDebtors(mappedDebtors);

        // Cache for offline use
        await cacheDebtors(mappedDebtors.map(d => ({
          id: d.id,
          businessId: business.id,
          customerName: d.customerName,
          customerPhone: d.customerPhone,
          amountOwed: d.amountOwed,
          amountPaid: d.amountPaid,
          status: d.status,
          notes: d.notes,
          createdAt: d.createdAt,
        })));
      } else {
        // Use cached data when offline
        const cached = await getCachedDebtors(business.id);
        setDebtors(cached.map(d => ({
          id: d.id,
          customerName: d.customerName,
          customerPhone: d.customerPhone,
          amountOwed: d.amountOwed,
          amountPaid: d.amountPaid,
          status: d.status as 'unpaid' | 'partially_paid' | 'paid',
          notes: d.notes,
          createdAt: d.createdAt,
        })));
      }
    } catch (e) {
      console.error('Failed to fetch debtors:', e);
      // Fallback to cache on error
      try {
        const cached = await getCachedDebtors(business.id);
        setDebtors(cached.map(d => ({
          id: d.id,
          customerName: d.customerName,
          customerPhone: d.customerPhone,
          amountOwed: d.amountOwed,
          amountPaid: d.amountPaid,
          status: d.status as 'unpaid' | 'partially_paid' | 'paid',
          notes: d.notes,
          createdAt: d.createdAt,
        })));
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async (debtorId: string) => {
    try {
      const { data, error } = await supabase
        .from('debtor_payments')
        .select('*')
        .eq('debtor_id', debtorId)
        .order('payment_date', { ascending: false });

      if (error) throw error;

      setPayments((data || []).map((p: any) => ({
        id: p.id,
        amount: Number(p.amount),
        paymentDate: p.payment_date,
        notes: p.notes,
      })));
    } catch (e) {
      console.error('Failed to fetch payments:', e);
    }
  };

  useEffect(() => {
    if (business?.id && isOnline) {
      fetchDebtors();
    }
  }, [business?.id, isOnline]);

  const resetAddForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setAmountOwed('');
    setNotes('');
  };

  const handleAddDebtor = async () => {
    if (!customerName.trim() || !amountOwed) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Customer name and amount are required.' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('debtors').insert({
        business_id: business!.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        amount_owed: Number(amountOwed),
        notes: notes.trim() || null,
      });

      if (error) throw error;

      toast({ title: 'Debtor Added' });
      setAddOpen(false);
      resetAddForm();
      await fetchDebtors();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not add debtor' });
    } finally {
      setSaving(false);
    }
  };

  const openPaymentDialog = async (debtor: Debtor) => {
    setSelectedDebtor(debtor);
    setPaymentAmount('');
    setPaymentNotes('');
    await fetchPayments(debtor.id);
    setPayOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedDebtor || !paymentAmount) {
      toast({ variant: 'destructive', title: 'Missing amount' });
      return;
    }

    const amount = Number(paymentAmount);
    const remaining = selectedDebtor.amountOwed - selectedDebtor.amountPaid;

    if (amount > remaining) {
      toast({ variant: 'destructive', title: 'Amount exceeds balance', description: `Maximum: ZMW ${remaining.toFixed(2)}` });
      return;
    }

    setSaving(true);
    try {
      // Insert payment record
      const { error: payError } = await supabase.from('debtor_payments').insert({
        debtor_id: selectedDebtor.id,
        amount,
        notes: paymentNotes.trim() || null,
      });

      if (payError) throw payError;

      // Update debtor
      const newAmountPaid = selectedDebtor.amountPaid + amount;
      const newStatus = newAmountPaid >= selectedDebtor.amountOwed ? 'paid' : 'partially_paid';

      const { error: updateError } = await supabase
        .from('debtors')
        .update({ amount_paid: newAmountPaid, status: newStatus })
        .eq('id', selectedDebtor.id);

      if (updateError) throw updateError;

      toast({ title: 'Payment Recorded' });
      setPayOpen(false);
      await fetchDebtors();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not record payment' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDebtor = async (debtor: Debtor) => {
    if (!confirm("Delete this debtor record? If there was a linked sale, stock will be restored.")) return;

    try {
      // Find if there's a linked sale to restore stock
      const { data: debtorData } = await supabase
        .from('debtors')
        .select('sale_id')
        .eq('id', debtor.id)
        .maybeSingle();

      if (debtorData?.sale_id) {
        // Get the sale items to restore stock
        const { data: saleData } = await supabase
          .from('sales')
          .select('items')
          .eq('id', debtorData.sale_id)
          .maybeSingle();

        if (saleData?.items && Array.isArray(saleData.items)) {
          for (const item of saleData.items as any[]) {
            const { data: product } = await supabase
              .from('products')
              .select('stock')
              .eq('id', item.productId)
              .maybeSingle();

            if (product) {
              const newStock = Number(product.stock || 0) + (item.quantity || 0);
              await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', item.productId);
            }
          }
        }

        // Also delete the linked sale
        await supabase.from('sales').delete().eq('id', debtorData.sale_id);
      }

      // Delete all payments for this debtor
      await supabase.from('debtor_payments').delete().eq('debtor_id', debtor.id);

      // Delete the debtor record
      const { error } = await supabase.from('debtors').delete().eq('id', debtor.id);
      if (error) throw error;

      toast({ title: 'Debtor Deleted', description: 'Stock has been restored if applicable.' });
      await fetchDebtors();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not delete debtor' });
    }
  };

  const filteredDebtors = useMemo(() => {
    if (activeTab === 'all') return debtors;
    return debtors.filter(d => d.status === activeTab);
  }, [debtors, activeTab]);

  const stats = useMemo(() => {
    const totalOwed = debtors.reduce((sum, d) => sum + d.amountOwed, 0);
    const totalPaid = debtors.reduce((sum, d) => sum + d.amountPaid, 0);
    const outstanding = totalOwed - totalPaid;
    const unpaidCount = debtors.filter(d => d.status !== 'paid').length;
    return { totalOwed, totalPaid, outstanding, unpaidCount };
  }, [debtors]);

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
        <LockScreen paymentCode={business.paymentCode} businessId={business.id} onRetrySync={refetchBusiness} />
      </>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500"><Check className="h-3 w-3 mr-1" /> Paid</Badge>;
      case 'partially_paid':
        return <Badge className="bg-amber-500"><Clock className="h-3 w-3 mr-1" /> Partial</Badge>;
      default:
        return <Badge variant="destructive"><Clock className="h-3 w-3 mr-1" /> Unpaid</Badge>;
    }
  };

  return (
    <>
      <ConnectionStatus />
      <OfflineBanner isOnline={isOnline} message="Offline mode - View only, changes require internet" />
      <div className="min-h-screen bg-background safe-area-inset">
        <header className="bg-card border-b border-border px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-display font-bold text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" /> Debtors
                </h1>
                <p className="text-xs text-muted-foreground">{isOnline ? 'Online' : 'Offline (view only)'}</p>
              </div>
            </div>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button variant="pos" size="sm" disabled={!isOnline}>
                  <Plus className="h-4 w-4 mr-2" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Debtor</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone (optional)</Label>
                    <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+260..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount Owed (ZMW)</Label>
                    <Input type="number" value={amountOwed} onChange={e => setAmountOwed(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Details about the credit..." />
                  </div>
                  <Button variant="pos" className="w-full" onClick={handleAddDebtor} disabled={saving}>
                    {saving ? 'Saving...' : 'Add Debtor'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <main className="p-4 max-w-4xl mx-auto space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-xl font-display font-bold text-destructive">ZMW {stats.outstanding.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="text-xl font-display font-bold text-green-600">ZMW {stats.totalPaid.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Credit</p>
                <p className="text-xl font-display font-bold">ZMW {stats.totalOwed.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Unpaid</p>
                <p className="text-xl font-display font-bold">{stats.unpaidCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* Debtors List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Credit Customers</CardTitle>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
                  <TabsTrigger value="partially_paid">Partial</TabsTrigger>
                  <TabsTrigger value="paid">Paid</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
              ) : filteredDebtors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No debtors in this category.</p>
              ) : (
                <div className="space-y-2">
                  {filteredDebtors.map(debtor => (
                    <div key={debtor.id} className="bg-secondary rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{debtor.customerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {debtor.customerPhone || 'No phone'} • {format(new Date(debtor.createdAt), 'MMM d, yyyy')}
                          </p>
                          {debtor.notes && <p className="text-xs text-muted-foreground mt-1">{debtor.notes}</p>}
                        </div>
                        {getStatusBadge(debtor.status)}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Owed: </span>
                          <span className="font-bold">ZMW {debtor.amountOwed.toFixed(2)}</span>
                          <span className="text-muted-foreground"> | Paid: </span>
                          <span className="text-green-600">ZMW {debtor.amountPaid.toFixed(2)}</span>
                          <span className="text-muted-foreground"> | Balance: </span>
                          <span className="text-destructive font-bold">ZMW {(debtor.amountOwed - debtor.amountPaid).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {debtor.status !== 'paid' && (
                            <Button variant="outline" size="sm" onClick={() => openPaymentDialog(debtor)} disabled={!isOnline}>
                              <DollarSign className="h-4 w-4 mr-1" /> Pay
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDeleteDebtor(debtor)} 
                            disabled={!isOnline}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        {/* Payment Dialog */}
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment - {selectedDebtor?.customerName}</DialogTitle>
            </DialogHeader>
            {selectedDebtor && (
              <div className="space-y-4">
                <div className="bg-secondary rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span>Total Owed</span>
                    <span>ZMW {selectedDebtor.amountOwed.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Already Paid</span>
                    <span className="text-green-600">ZMW {selectedDebtor.amountPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg mt-1">
                    <span>Balance</span>
                    <span className="text-destructive">ZMW {(selectedDebtor.amountOwed - selectedDebtor.amountPaid).toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payment Amount (ZMW)</Label>
                  <Input
                    type="number"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    max={selectedDebtor.amountOwed - selectedDebtor.amountPaid}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="Payment details..." />
                </div>

                <Button variant="pos" className="w-full" onClick={handleRecordPayment} disabled={saving}>
                  {saving ? 'Recording...' : 'Record Payment'}
                </Button>

                {payments.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Payment History</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {payments.map(p => (
                        <div key={p.id} className="flex justify-between text-sm bg-secondary rounded p-2">
                          <span>{format(new Date(p.paymentDate), 'MMM d, yyyy')}</span>
                          <span className="font-medium text-green-600">ZMW {p.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default Debtors;
