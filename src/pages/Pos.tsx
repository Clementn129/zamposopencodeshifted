import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Search, ShoppingCart, Trash2, Percent, DollarSign, Users, Briefcase, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import ConnectionStatus from "@/components/ConnectionStatus";
import SyncStatusBanner from "@/components/SyncStatusBanner";
import ReceiptModal from "@/components/ReceiptModal";
import LockScreen from "@/components/LockScreen";
import QuotationTab from "@/components/QuotationTab";
import { useAuthContext } from "@/contexts/AuthContext";
import { useBusiness } from "@/hooks/useBusiness";
import { useProducts } from "@/hooks/useProducts";
import { useSalesSync } from "@/hooks/useSalesSync";
import { useBusinessType } from "@/hooks/useBusinessType";
import { saveOfflineSale, updateCachedProductStock, generateOfflineId, clearCart, getCart, saveCartItem, removeCartItem } from "@/lib/offlineStorage";
import { calculateTax, TaxCategory } from "@/lib/tax";
import { supabase } from "@/integrations/supabase/client";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";

type CartLine = { 
  productId: string; 
  name: string; 
  price: number; 
  quantity: number;
  costPrice?: number | null;
  discountType?: 'percentage' | 'amount' | null;
  discountValue?: number;
  notes?: string;
  taxCategory?: TaxCategory;
};

interface ReceiptData {
  items: Array<{ name: string; price: number; quantity: number; discountType?: string | null; discountValue?: number; notes?: string }>;
  subtotal: number;
  total: number;
  discountAmount: number;
  paymentMethod: string;
  date: string;
  receiptId: string;
  taxAmount?: number;
  taxLabel?: string;
  customerName?: string | null;
  customerTpin?: string | null;
}

const Pos = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading, role, signOut } = useAuthContext();
  const { business, isLoading: bizLoading, refetch: refetchBusiness, checkSubscriptionStatus } = useBusiness(user?.id);
  const { isLocked } = checkSubscriptionStatus();

  const { activeProducts, isLoading: productsLoading, isOnline, refetch: refetchProducts } = useProducts(business?.id);
  const { isSyncing, pendingCount, lastSyncError, syncNow } = useSalesSync(business?.id);
  const { labels, isService } = useBusinessType(business?.id);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mobile_money">("cash");
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("sale");

  // Discount state
  const [saleDiscountType, setSaleDiscountType] = useState<'percentage' | 'amount' | null>(null);
  const [saleDiscountValue, setSaleDiscountValue] = useState("");

  // Amount received / change calculation
  const [amountReceived, setAmountReceived] = useState("");

  // Payment mode: full = paid in full; partial = part paid now, rest owed; credit = nothing paid, all owed.
  const [paymentMode, setPaymentMode] = useState<"full" | "partial" | "credit">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerTpin, setCustomerTpin] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const isCredit = paymentMode !== "full";

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return activeProducts;
    const query = searchQuery.toLowerCase();
    return activeProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query) ||
        (p.category && p.category.toLowerCase().includes(query))
    );
  }, [activeProducts, searchQuery]);

  // Group products by category
  const groupedProducts = useMemo(() => {
    const groups: Record<string, typeof filteredProducts> = {};
    filteredProducts.forEach((p) => {
      const cat = p.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return groups;
  }, [filteredProducts]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    getCart().then((items) => setCart(items.map((i) => ({ ...i }))));
  }, []);

  const subtotal = useMemo(() => cart.reduce((s, l) => {
    const lineTotal = l.price * l.quantity;
    if (l.discountType === 'percentage' && l.discountValue) {
      return s + lineTotal * (1 - l.discountValue / 100);
    } else if (l.discountType === 'amount' && l.discountValue) {
      return s + Math.max(0, lineTotal - l.discountValue);
    }
    return s + lineTotal;
  }, 0), [cart]);

  const discountAmount = useMemo(() => {
    if (!saleDiscountType || !saleDiscountValue) return 0;
    const value = Number(saleDiscountValue) || 0;
    if (saleDiscountType === 'percentage') {
      return subtotal * (value / 100);
    }
    return Math.min(value, subtotal);
  }, [subtotal, saleDiscountType, saleDiscountValue]);

  const total = subtotal - discountAmount;

  const changeDue = useMemo(() => {
    const received = Number(amountReceived) || 0;
    if (received <= 0) return null;
    return received - total;
  }, [amountReceived, total]);

  const addToCart = async (productId: string) => {
    const p = activeProducts.find((x) => x.id === productId);
    if (!p) return;
    const displayName = p.variantLabel ? `${p.name} · ${p.variantLabel}` : p.name;
    const existing = cart.find((l) => l.productId === productId);
    const nextQty = (existing?.quantity ?? 0) + 1;
    if (p.itemType !== 'service' && nextQty > (p.stock ?? 0)) {
      toast({ variant: "destructive", title: "Not enough stock", description: `${displayName} has only ${p.stock ?? 0} left.` });
      return;
    }
    const next = existing
      ? cart.map((l) => (l.productId === productId ? { ...l, quantity: nextQty } : l))
      : [...cart, { productId, name: displayName, price: p.price ?? 0, quantity: 1, costPrice: p.costPrice, taxCategory: p.taxCategory }];
    setCart(next);
    await saveCartItem({ productId, name: displayName, price: p.price ?? 0, quantity: nextQty });
  };

  // Barcode scanner support — works with any USB/Bluetooth keyboard-wedge
  // scanner. Looks up by exact barcode first, then product id, then name.
  useBarcodeScanner((code) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const match =
      activeProducts.find((p) => p.barcode && p.barcode.toLowerCase() === lower) ||
      activeProducts.find((p) => p.id.toLowerCase() === lower) ||
      activeProducts.find((p) => p.name.toLowerCase() === lower);
    if (match) {
      addToCart(match.id);
    } else {
      // Fall back to populating the search box so the user sees the code.
      setSearchQuery(trimmed);
      toast({ variant: "destructive", title: "Barcode not found", description: trimmed });
    }
  }, { enabled: activeTab === "sale" });


  const decQty = async (productId: string) => {
    const existing = cart.find((l) => l.productId === productId);
    if (!existing) return;
    if (existing.quantity <= 1) {
      setCart(cart.filter((l) => l.productId !== productId));
      await removeCartItem(productId);
      return;
    }
    const nextQty = existing.quantity - 1;
    setCart(cart.map((l) => (l.productId === productId ? { ...l, quantity: nextQty } : l)));
    await saveCartItem({ ...existing, quantity: nextQty });
  };

  const updateItemDiscount = (productId: string, type: 'percentage' | 'amount' | null, value: number) => {
    setCart(prevCart => prevCart.map((l) => 
      l.productId === productId 
        ? { ...l, discountType: type, discountValue: value }
        : l
    ));
  };

  const updateItemNotes = (productId: string, notes: string) => {
    setCart(prevCart => prevCart.map((l) =>
      l.productId === productId
        ? { ...l, notes }
        : l
    ));
  };

  const clear = async () => { 
    setCart([]); 
    await clearCart(); 
    setSaleDiscountType(null);
    setSaleDiscountValue("");
    setPaymentMode("full");
    setPartialAmount("");
    setDueDate("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerTpin("");
    setCreditNotes("");
    setAmountReceived("");
  };

  // Tax breakdown — recomputed on every cart/discount change
  const taxBreakdown = useMemo(() => {
    if (!business) return null;
    // Build per-line effective amounts AFTER per-line discount AND proportional global discount
    const linesAfterItemDisc = cart.map((l) => {
      const gross = l.price * l.quantity;
      let net = gross;
      if (l.discountType === 'percentage' && l.discountValue) net = gross * (1 - l.discountValue / 100);
      else if (l.discountType === 'amount' && l.discountValue) net = Math.max(0, gross - l.discountValue);
      return { amount: net, taxCategory: (l.taxCategory || 'taxable') as TaxCategory };
    });
    const sub = linesAfterItemDisc.reduce((s, l) => s + l.amount, 0);
    const taxLines = linesAfterItemDisc.map(l => ({
      lineAmount: sub > 0 ? l.amount - (l.amount / sub) * discountAmount : l.amount,
      taxCategory: l.taxCategory,
    }));
    return calculateTax(
      {
        taxMode: business.taxMode,
        vatRate: business.vatRate,
        customTaxName: business.customTaxName,
        customTaxRate: business.customTaxRate,
      },
      taxLines
    );
  }, [cart, discountAmount, business]);

  const completeSale = async () => {
    if (!business || cart.length === 0) return;

    if (isCredit && !customerName.trim()) {
      toast({ variant: "destructive", title: "Customer name required", description: "Enter customer name for credit / partial sales." });
      return;
    }

    // Validate customer TPIN if provided
    const trimmedCustomerTpin = customerTpin.trim();
    if (trimmedCustomerTpin && !/^\d{10}$/.test(trimmedCustomerTpin)) {
      toast({ variant: "destructive", title: "Invalid TPIN", description: "Customer TPIN must be 10 digits." });
      return;
    }

    // Derive amount_paid from payment mode
    let amountPaidNow = total; // full
    if (paymentMode === "credit") {
      amountPaidNow = 0;
    } else if (paymentMode === "partial") {
      const p = Number(partialAmount) || 0;
      if (p <= 0) {
        toast({ variant: "destructive", title: "Enter partial amount", description: "Partial payment must be greater than 0." });
        return;
      }
      if (p >= total) {
        toast({ variant: "destructive", title: "Use 'Paid in Full'", description: "Partial amount must be less than the total." });
        return;
      }
      amountPaidNow = p;
    }

    setIsProcessing(true);

    const saleId = generateOfflineId();
    const createdAt = new Date().toISOString();
    const tax = taxBreakdown;

    const salePayload = {
      id: saleId, businessId: business.id,
      items: cart.map((l) => {
        const p = activeProducts.find((x) => x.id === l.productId);
        return { 
          productId: l.productId, 
          name: l.name, 
          price: l.price, 
          quantity: l.quantity,
          costPrice: p?.costPrice || l.costPrice || null,
          discountType: l.discountType || null,
          discountValue: l.discountValue || 0,
          notes: l.notes || null,
          taxCategory: l.taxCategory || p?.taxCategory || 'taxable',
        };
      }),
      subtotal, total, discountAmount,
      discountType: saleDiscountType,
      paymentMethod, createdAt, synced: isOnline,
      taxAmount: tax?.taxAmount || 0,
      taxableAmount: tax?.taxableAmount || 0,
      zeroRatedAmount: tax?.zeroRatedAmount || 0,
      exemptAmount: tax?.exemptAmount || 0,
      customerName: (customerName.trim() || null),
      customerTpin: (trimmedCustomerTpin || null),
      customerPhone: (customerPhone.trim() || null),
      amountPaid: amountPaidNow,
      dueDate: dueDate || null,
    };

    try {
      if (isOnline) {
        const { data: returnedSaleId, error: saleErr } = await (supabase.rpc as any)("sync_offline_sale", {
          p_business_id: business.id,
          p_offline_id: saleId,
          p_items: salePayload.items,
          p_subtotal: subtotal,
          p_total: total,
          p_discount_amount: discountAmount,
          p_discount_type: saleDiscountType,
          p_payment_method: paymentMethod,
          p_created_at: createdAt,
          p_tax_amount: salePayload.taxAmount,
          p_taxable_amount: salePayload.taxableAmount,
          p_zero_rated_amount: salePayload.zeroRatedAmount,
          p_exempt_amount: salePayload.exemptAmount,
          p_customer_name: salePayload.customerName,
          p_customer_tpin: salePayload.customerTpin,
          p_amount_paid: amountPaidNow,
          p_due_date: dueDate || null,
          p_customer_phone: salePayload.customerPhone,
        });

        if (saleErr) throw saleErr;

        for (const line of cart) {
          const p = activeProducts.find((x) => x.id === line.productId);
          await updateCachedProductStock(line.productId, Math.max(0, Number(p?.stock ?? 0) - line.quantity));
        }

        // Legacy debtors table — kept for the existing Debtors page until the
        // unified sales-based view fully replaces it.
        if (isCredit && returnedSaleId) {
          const { error: debtorErr } = await supabase.from("debtors").insert({
            business_id: business.id,
            sale_id: returnedSaleId,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim() || null,
            amount_owed: total,
            amount_paid: amountPaidNow,
            status: amountPaidNow > 0 ? "partially_paid" : "unpaid",
            notes: creditNotes.trim() || null,
          });
          if (debtorErr) console.error("Failed to create debtor:", debtorErr);
        }

        toast({
          title: paymentMode === "credit" ? "Credit sale recorded" : paymentMode === "partial" ? "Partial sale recorded" : "Sale completed",
          description: paymentMode === "full" ? "Stock updated." : `Balance owed: ZMW ${(total - amountPaidNow).toFixed(2)}`,
        });
      } else {
        await saveOfflineSale(salePayload);
        for (const line of cart) {
          const p = activeProducts.find((x) => x.id === line.productId);
          await updateCachedProductStock(line.productId, Math.max(0, Number(p?.stock ?? 0) - line.quantity));
        }
        toast({ title: "Saved offline", description: "Sale will sync when online." });
      }

      if (isOnline) {
        await syncNow();
      }
      setReceiptData({
        items: cart.map((l) => ({ 
          name: l.name, 
          price: l.price, 
          quantity: l.quantity,
          discountType: l.discountType,
          discountValue: l.discountValue,
          notes: l.notes
        })),
        subtotal, total, discountAmount, paymentMethod, date: createdAt, receiptId: saleId,
        taxAmount: salePayload.taxAmount,
        taxLabel: tax?.label,
        customerName: salePayload.customerName,
        customerTpin: salePayload.customerTpin,
      } as any);
      await clear();
      await refetchProducts();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e?.message ?? "Could not complete sale" });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle converting a quotation to a sale — loads items into the cart
  const handleConvertQuotation = (
    items: Array<{ productId: string; name: string; price: number; quantity: number; discountType?: string | null; discountValue?: number }>,
    discType: string | null,
    discValue: number
  ) => {
    const cartLines: CartLine[] = items.map(i => ({
      productId: i.productId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      discountType: (i.discountType as CartLine['discountType']) || null,
      discountValue: i.discountValue || 0,
    }));
    setCart(cartLines);
    if (discType) {
      setSaleDiscountType(discType as 'percentage' | 'amount');
      setSaleDiscountValue(discValue.toString());
    }
    setActiveTab("sale");
  };

  // Only block on initial loading. Once business+products are loaded, never
  // unmount on background refetches — that causes any open view (e.g. a
  // quotation detail) to disappear and look like a page reload.
  if (authLoading || bizLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Loading…</p></div>;
  }
  if (!business) return null;
  if (isLocked) return <><ConnectionStatus /><LockScreen paymentCode={business.paymentCode} businessId={business.id} onRetrySync={refetchBusiness} /></>;

  return (
    <>
      <ConnectionStatus />
      <SyncStatusBanner isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingCount} lastSyncError={lastSyncError} />
      {receiptData && (
        <ReceiptModal
          open={!!receiptData}
          onClose={() => setReceiptData(null)}
          businessName={business.name}
          businessDetails={{
            phone: business.phone,
            email: business.email,
            address: business.address,
            tpin: business.tpin,
          }}
          items={receiptData.items}
          subtotal={receiptData.subtotal}
          total={receiptData.total}
          discountAmount={receiptData.discountAmount}
          paymentMethod={receiptData.paymentMethod}
          date={receiptData.date}
          receiptId={receiptData.receiptId}
          isService={isService}
          taxAmount={receiptData.taxAmount}
          taxLabel={receiptData.taxLabel}
          customerName={receiptData.customerName}
          customerTpin={receiptData.customerTpin}
        />
      )}
      <div className="min-h-screen bg-background safe-area-inset">
        <header className="bg-card border-b border-border px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {role === 'cashier' ? (
                <Button variant="ghost" size="icon" onClick={async () => { await signOut(); navigate('/auth'); }} aria-label="Sign out"><ArrowLeft className="h-5 w-5" /></Button>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}><ArrowLeft className="h-5 w-5" /></Button>
              )}
              <div>
                <h1 className="font-display font-bold text-lg flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> POS</h1>
                <p className="text-xs text-muted-foreground">{isOnline ? (isSyncing ? "Syncing…" : "Online") : "Offline"}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={refetchProducts}>Refresh</Button>
          </div>
        </header>

        <main className="p-4 max-w-4xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="sale" className="flex items-center gap-1.5">
                <ShoppingCart className="h-4 w-4" /> New Sale
              </TabsTrigger>
              <TabsTrigger value="quotations" className="flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Quotations
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sale">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {isService ? <Briefcase className="h-4 w-4" /> : null}
                      {labels.posItemsTitle}
                    </CardTitle>
                    <CardDescription>{labels.posItemsDescription}</CardDescription>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder={`Search by name, category, or scan barcode...`}
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        data-scanner-target="true"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
                    {Object.keys(groupedProducts).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {searchQuery ? `No ${isService ? 'services' : 'products'} match your search.` : labels.noItemsMessage}
                      </p>
                    ) : (
                      Object.entries(groupedProducts).map(([cat, prods]) => (
                        <div key={cat} className="space-y-1">
                          <div className="bg-muted/50 rounded px-2 py-1 text-xs font-medium text-muted-foreground sticky top-0">
                            {cat} ({prods.length})
                          </div>
                          {prods.map((p) => {
                            const displayName = p.variantLabel ? `${p.name} · ${p.variantLabel}` : p.name;
                            return (
                              <button key={p.id} onClick={() => addToCart(p.id)} className="w-full text-left bg-secondary rounded-lg p-3 hover:opacity-90 transition">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    {p.imageUrl ? (
                                      <img src={p.imageUrl} alt={displayName} className="h-10 w-10 rounded object-cover shrink-0" />
                                    ) : (
                                      <div className="h-10 w-10 rounded bg-muted shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="font-medium truncate">{displayName}</p>
                                      <p className="text-xs text-muted-foreground">
                                        ZMW {(p.price ?? 0).toFixed(2)} {labels.showStock && p.itemType !== 'service' ? `• ${labels.stockDisplay(p.stock ?? 0)}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-lg">{isService ? 'Invoice' : 'Cart'}</CardTitle><CardDescription>{isService ? 'Complete transaction' : 'Complete sale'}</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {cart.length === 0 ? <p className="text-sm text-muted-foreground">{isService ? 'No services added.' : 'Cart empty.'}</p> : cart.map((l) => (
                      <div key={l.productId} className="bg-secondary rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div><p className="font-medium">{l.name}</p><p className="text-xs text-muted-foreground">{l.quantity} {labels.quantityLabel} × ZMW {l.price.toFixed(2)}</p></div>
                          <div className="flex gap-1">
                            <Button variant="outline" size="icon" onClick={() => decQty(l.productId)}><Minus className="h-4 w-4" /></Button>
                            <Button variant="outline" size="icon" onClick={() => addToCart(l.productId)}><Plus className="h-4 w-4" /></Button>
                            <Button variant="outline" size="icon" onClick={() => { setCart(cart.filter((x) => x.productId !== l.productId)); removeCartItem(l.productId); }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                        {/* Item discount */}
                        <div className="flex items-center gap-2 mt-2">
                          <Select 
                            value={l.discountType || "none"} 
                            onValueChange={(v) => updateItemDiscount(l.productId, v === 'none' ? null : v as 'percentage' | 'amount', l.discountValue || 0)}
                          >
                            <SelectTrigger className="w-24 h-8 text-xs">
                              <SelectValue placeholder="Discount" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="percentage">%</SelectItem>
                              <SelectItem value="amount">ZMW</SelectItem>
                            </SelectContent>
                          </Select>
                          {l.discountType && (
                            <Input
                              type="number"
                              placeholder="0"
                              value={l.discountValue || ""}
                              onChange={(e) => updateItemDiscount(l.productId, l.discountType!, Number(e.target.value) || 0)}
                              className="w-20 h-8 text-xs"
                            />
                          )}
                        </div>
                        {/* Notes field for service businesses */}
                        {isService && (
                          <div className="mt-2">
                            <Input
                              type="text"
                              placeholder="Add notes (e.g., duration, details)"
                              value={l.notes || ""}
                              onChange={(e) => updateItemNotes(l.productId, e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    ))}

                    {cart.length > 0 && (
                      <>
                        {/* Sale-wide discount */}
                        <div className="border-t pt-3">
                          <Label className="text-sm flex items-center gap-1 mb-2">
                            <Percent className="h-4 w-4" /> Sale Discount
                          </Label>
                          <div className="flex gap-2">
                            <Select value={saleDiscountType || "none"} onValueChange={(v) => setSaleDiscountType(v === 'none' ? null : v as 'percentage' | 'amount')}>
                              <SelectTrigger className="w-24">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="percentage">%</SelectItem>
                                <SelectItem value="amount">ZMW</SelectItem>
                              </SelectContent>
                            </Select>
                            {saleDiscountType && (
                              <Input
                                type="number"
                                placeholder="0"
                                value={saleDiscountValue}
                                onChange={(e) => setSaleDiscountValue(e.target.value)}
                                className="flex-1"
                              />
                            )}
                          </div>
                        </div>

                        {/* Customer Info (optional - for tax invoice / TPIN) */}
                        <div className="border-t pt-3 space-y-2">
                          <Label className="text-sm">Customer (optional)</Label>
                          <Input
                            placeholder="Customer name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                          />
                          <Input
                            placeholder="Customer TPIN (10 digits)"
                            inputMode="numeric"
                            maxLength={10}
                            value={customerTpin}
                            onChange={(e) => setCustomerTpin(e.target.value.replace(/\D/g, ''))}
                          />
                        </div>

                        {/* Payment mode: full / partial / credit */}
                        <div className="border-t pt-3 space-y-2">
                          <Label className="text-sm flex items-center gap-1">
                            <Users className="h-4 w-4" /> Payment Mode
                          </Label>
                          <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as any)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">Paid in Full</SelectItem>
                              <SelectItem value="partial">Partial Payment</SelectItem>
                              <SelectItem value="credit">Credit (Pay Later)</SelectItem>
                            </SelectContent>
                          </Select>
                          {isCredit && (
                            <div className="mt-2 space-y-2">
                              {!customerName.trim() && (
                                <p className="text-xs text-destructive">Customer name (above) is required for credit / partial sales.</p>
                              )}
                              <Input
                                placeholder="Customer phone"
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                              />
                              {paymentMode === "partial" && (
                                <div>
                                  <Label className="text-xs">Amount Paid Now (ZMW)</Label>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    max={total}
                                    placeholder={`0 – ${total.toFixed(2)}`}
                                    value={partialAmount}
                                    onChange={(e) => setPartialAmount(e.target.value)}
                                  />
                                </div>
                              )}
                              <div>
                                <Label className="text-xs">Due Date (optional)</Label>
                                <Input
                                  type="date"
                                  value={dueDate}
                                  onChange={(e) => setDueDate(e.target.value)}
                                />
                              </div>
                              <Textarea
                                placeholder="Notes (optional)"
                                value={creditNotes}
                                onChange={(e) => setCreditNotes(e.target.value)}
                                className="h-16"
                              />
                              <p className="text-xs text-muted-foreground">
                                Balance owed: <strong>ZMW {Math.max(0, total - (paymentMode === "partial" ? Number(partialAmount) || 0 : 0)).toFixed(2)}</strong>
                              </p>
                            </div>
                          )}
                        </div>

                      </>
                    )}

                    <div className="border-t pt-3 space-y-1">
                      {taxBreakdown && taxBreakdown.taxAmount > 0 ? (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal (excl.)</span>
                            <span>ZMW {taxBreakdown.netSubtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{taxBreakdown.label}</span>
                            <span>ZMW {taxBreakdown.taxAmount.toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span>ZMW {subtotal.toFixed(2)}</span>
                        </div>
                      )}
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Discount</span>
                          <span>-ZMW {discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <span className="text-lg font-bold">ZMW {total.toFixed(2)}</span>
                      </div>
                    </div>

                    <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Amount received & change calculator */}
                    {paymentMethod === "cash" && cart.length > 0 && (
                      <div className="border-t pt-3 space-y-2">
                        <Label className="text-sm flex items-center gap-1">
                          <DollarSign className="h-4 w-4" /> Amount Received
                        </Label>
                        <Input
                          type="number"
                          placeholder="Enter amount given by customer"
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(e.target.value)}
                          min="0"
                        />
                        {changeDue !== null && (
                          <div className={`rounded-lg p-3 text-center font-bold text-lg ${changeDue >= 0 ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-destructive/10 text-destructive'}`}>
                            {changeDue >= 0
                              ? `Change: ZMW ${changeDue.toFixed(2)}`
                              : `Short: ZMW ${Math.abs(changeDue).toFixed(2)}`}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={clear} disabled={!cart.length || isProcessing}>Clear</Button>
                      <Button variant="pos" onClick={completeSale} disabled={!cart.length || isProcessing}>
                        {isProcessing ? "Processing…" : paymentMode === "credit" ? "Record Credit" : paymentMode === "partial" ? "Record Partial" : "Complete"}
                      </Button>
                    </div>
                    {!isOnline && <p className="text-xs text-muted-foreground">Offline mode: sales saved locally.</p>}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="quotations">
              <QuotationTab
                businessId={business.id}
                businessName={business.name}
                businessDetails={{
                  phone: business.phone,
                  email: business.email,
                  address: business.address,
                  logoUrl: business.logoUrl,
                  tpin: business.tpin,
                  taxMode: business.taxMode,
                  vatRate: business.vatRate,
                  customTaxName: business.customTaxName,
                  customTaxRate: business.customTaxRate,
                }}
                products={activeProducts}
                isService={isService}
                onConvertToSale={handleConvertQuotation}
              />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
};

export default Pos;
