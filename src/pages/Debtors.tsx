import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Users, DollarSign, Check, Clock, Trash2, Search, Package } from 'lucide-react';
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
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cacheDebtors, getCachedDebtors, updateCachedDebtor, generateOfflineId, updateCachedProductStock } from '@/lib/offlineStorage';

type Debtor = {
  id: string;
  saleId: string | null;
  customerName: string;
  customerPhone: string | null;
  amountOwed: number;
  amountPaid: number;
  status: 'unpaid' | 'partially_paid' | 'paid';
  notes: string | null;
  createdAt: string;
  linkedItems?: Array<{ productId: string; name: string; price: number; quantity: number }>;
};

type CreditCartLine = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
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
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const { activeProducts, isLoading: productsLoading } = useProducts(business?.id);
  const [productSearch, setProductSearch] = useState('');
  const [creditCart, setCreditCart] = useState<CreditCartLine[]>([]);

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

        // Batch fetch linked sale items
        const saleIds = (data || []).map(d => d.sale_id).filter(Boolean);
        const saleItemsMap: Record<string, Array<{ productId: string; name: string; price: number; quantity: number }>> = {};
        if (saleIds.length > 0) {
          const { data: salesData } = await supabase
            .from('sales')
            .select('id, items')
            .in('id', saleIds);
          if (salesData) {
            for (const s of salesData) {
              if (s.items && Array.isArray(s.items)) {
                saleItemsMap[s.id] = s.items.map((i: any) => ({
                  productId: i.productId || i.product_id,
                  name: i.name,
                  price: Number(i.price || 0),
                  quantity: Number(i.quantity || 0),
                }));
              }
            }
          }
        }

        const mappedDebtors = (data || []).map((d: any) => ({
          id: d.id,
          saleId: d.sale_id || null,
          customerName: d.customer_name,
          customerPhone: d.customer_phone,
          amountOwed: Number(d.amount_owed),
          amountPaid: Number(d.amount_paid),
          status: d.status as 'unpaid' | 'partially_paid' | 'paid',
          notes: d.notes,
          createdAt: d.created_at,
          linkedItems: d.sale_id ? (saleItemsMap[d.sale_id] || []) : undefined,
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
          saleId: null,
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
          saleId: null,
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
    setDueDate('');
    setNotes('');
    setProductSearch('');
    setCreditCart([]);
  };

  const addToCreditCart = (productId: string) => {
    const p = activeProducts.find(x => x.id === productId);
    if (!p) return;
    setCreditCart(prev => {
      const existing = prev.find(l => l.productId === productId);
      if (existing) {
        const nextQty = existing.quantity + 1;
        if (p.itemType !== 'service' && nextQty > (p.stock ?? 0)) {
          return prev;
        }
        return prev.map(l => l.productId === productId ? { ...l, quantity: nextQty } : l);
      }
      if (p.itemType !== 'service' && p.stock <= 0) return prev;
      return [...prev, { productId, name: p.variantLabel ? `${p.name} · ${p.variantLabel}` : p.name, price: p.price ?? 0, quantity: 1, stock: p.stock ?? 0 }];
    });
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCreditCart(prev => {
      const line = prev.find(l => l.productId === productId);
      if (!line) return prev;
      const nextQty = line.quantity + delta;
      if (nextQty <= 0) return prev.filter(l => l.productId !== productId);
      return prev.map(l => l.productId === productId ? { ...l, quantity: nextQty } : l);
    });
  };

  const removeFromCart = (productId: string) => {
    setCreditCart(prev => prev.filter(l => l.productId !== productId));
  };

  const creditCartTotal = useMemo(() =>
    creditCart.reduce((s, l) => s + l.price * l.quantity, 0),
  [creditCart]);

  const filteredProductsForAdd = useMemo(() => {
    if (!productSearch.trim()) return activeProducts;
    const q = productSearch.toLowerCase();
    return activeProducts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }, [activeProducts, productSearch]);

  const handleAddDebtor = async () => {
    if (!customerName.trim()) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Customer name is required.' });
      return;
    }
    if (creditCart.length === 0) {
      toast({ variant: 'destructive', title: 'No products', description: 'Select at least one product.' });
      return;
    }

    setSaving(true);
    try {
      if (!isOnline) {
        toast({ variant: 'destructive', title: 'Offline', description: 'Connect to internet to create credit sales.' });
        setSaving(false);
        return;
      }

      const now = new Date().toISOString();
      const offlineId = generateOfflineId();
      const items = creditCart.map(l => ({
        productId: l.productId,
        name: l.name,
        price: l.price,
        quantity: l.quantity,
        costPrice: null,
        discountType: null,
        discountValue: 0,
        notes: null,
        taxCategory: 'taxable' as const,
      }));
      const total = creditCartTotal;

      const { data: returnedSaleId, error: saleErr } = await (supabase.rpc as any)('sync_offline_sale', {
        p_business_id: business!.id,
        p_offline_id: offlineId,
        p_items: items,
        p_subtotal: total,
        p_total: total,
        p_discount_amount: 0,
        p_discount_type: null,
        p_payment_method: 'credit',
        p_created_at: now,
        p_tax_amount: 0,
        p_taxable_amount: 0,
        p_zero_rated_amount: 0,
        p_exempt_amount: 0,
        p_customer_name: customerName.trim(),
        p_customer_tpin: null,
        p_amount_paid: 0,
        p_due_date: dueDate || null,
        p_customer_phone: customerPhone.trim() || null,
      });

      if (saleErr) throw saleErr;

      for (const line of creditCart) {
        const p = activeProducts.find(x => x.id === line.productId);
        if (p) {
          await updateCachedProductStock(line.productId, Math.max(0, Number(p.stock ?? 0) - line.quantity));
        }
      }

      const { error: debtorErr } = await supabase.from('debtors').insert({
        business_id: business!.id,
        sale_id: returnedSaleId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        amount_owed: total,
        amount_paid: 0,
        status: 'unpaid',
        notes: notes.trim() || null,
      });

      if (debtorErr) throw debtorErr;

      toast({ title: 'Credit Sale Recorded', description: `ZMW ${total.toFixed(2)} — stock deducted.` });
      setAddOpen(false);
      resetAddForm();
      await fetchDebtors();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not create credit sale' });
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

      // If this debtor has a linked sale, also update the sale's payment status
      const { data: debtorData } = await supabase
        .from('debtors')
        .select('sale_id')
        .eq('id', selectedDebtor.id)
        .maybeSingle();

      if (debtorData?.sale_id) {
        await (supabase.rpc as any)('record_sale_payment', {
          p_sale_id: debtorData.sale_id,
          p_amount: amount,
          p_payment_method: 'cash',
          p_notes: 'Payment via debtors',
        }).catch((e: any) => console.error('Failed to update linked sale payment:', e));
      }

      toast({ title: 'Payment Recorded' });
      setPayOpen(false);
      await fetchDebtors();
      // Notify sales history to refresh
      window.dispatchEvent(new CustomEvent('zampos:sale-payment-changed'));
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
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New Credit Sale</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-2">
                      <Label>Phone (optional)</Label>
                      <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+260..." />
                    </div>
                    <div className="w-36 space-y-2">
                      <Label>Due Date</Label>
                      <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                    </div>
                  </div>

                  {/* Product selection */}
                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Package className="h-4 w-4" /> Products on Credit
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        placeholder="Search products..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {productsLoading ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">Loading products...</p>
                      ) : filteredProductsForAdd.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">No products found</p>
                      ) : (
                        filteredProductsForAdd.map(p => {
                          const inCart = creditCart.find(l => l.productId === p.id);
                          return (
                            <div key={p.id} className="flex items-center justify-between py-1 px-1 rounded hover:bg-secondary cursor-pointer" onClick={() => addToCreditCart(p.id)}>
                              <div className="text-sm">
                                <span>{p.variantLabel ? `${p.name} · ${p.variantLabel}` : p.name}</span>
                                <span className="text-muted-foreground ml-2">ZMW {Number(p.price).toFixed(2)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {p.itemType !== 'service' && (
                                  <span className={`text-xs ${Number(p.stock) <= 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    {Number(p.stock)} left
                                  </span>
                                )}
                                {inCart && <Badge className="bg-green-500 text-xs">{inCart.quantity}</Badge>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Credit cart */}
                  {creditCart.length > 0 && (
                    <div className="border rounded-lg p-3 space-y-2">
                      <div className="text-sm font-medium">Selected Items</div>
                      {creditCart.map(line => (
                        <div key={line.productId} className="flex items-center justify-between bg-secondary rounded p-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="truncate">{line.name}</p>
                            <p className="text-muted-foreground">ZMW {line.price.toFixed(2)} × {line.quantity}</p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateCartQty(line.productId, -1)}>
                              -
                            </Button>
                            <span className="w-6 text-center font-medium">{line.quantity}</span>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateCartQty(line.productId, 1)}>
                              +
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeFromCart(line.productId)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="text-right font-bold pt-1">
                        Total: ZMW {creditCartTotal.toFixed(2)}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Details about the credit..." />
                  </div>
                  <Button variant="pos" className="w-full" onClick={handleAddDebtor} disabled={saving || creditCart.length === 0}>
                    {saving ? 'Processing...' : `Record Credit Sale`}
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

                      {/* Linked products */}
                      {debtor.linkedItems && debtor.linkedItems.length > 0 && (
                        <div className="mb-2 space-y-0.5">
                          {debtor.linkedItems.map((item, idx) => (
                            <div key={idx} className="text-xs text-muted-foreground flex justify-between">
                              <span>{item.quantity}× {item.name}</span>
                              <span>ZMW {(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}

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
