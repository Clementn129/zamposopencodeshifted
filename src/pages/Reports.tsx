import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, TrendingUp, ShoppingCart, Receipt, Wallet, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { lusakaDayRange, lusakaWeekRange, lusakaMonthRange, lusakaDateLabel } from "@/lib/dateRange";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConnectionStatus from "@/components/ConnectionStatus";
import { useAuthContext } from "@/contexts/AuthContext";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { formatZMW } from "@/lib/currency";
import { useToast } from "@/hooks/use-toast";

type Period = "today" | "week" | "month";

const Reports = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuthContext();
  const { business, isLoading: bizLoading } = useBusiness(user?.id);
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [debtors, setDebtors] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const range = useMemo(() => {
    if (period === "today") return lusakaDayRange();
    if (period === "week") return lusakaWeekRange();
    return lusakaMonthRange();
  }, [period]);


  const fetchAll = async () => {
    if (!business?.id) return;
    setLoading(true);
    const [{ data: s }, { data: e }, { data: d }] = await Promise.all([
      supabase
        .from("sales")
        .select("id, total, items, tax_amount, payment_method, cashier_name, status, created_at")
        .eq("business_id", business.id)
        .gte("created_at", range.from.toISOString())
        .lte("created_at", range.to.toISOString()),
      supabase
        .from("expenses")
        .select("id, amount, category, expense_date")
        .eq("business_id", business.id)
        .gte("expense_date", lusakaDateLabel(range.from))
        .lte("expense_date", lusakaDateLabel(range.to)),
      supabase
        .from("debtors")
        .select("id, balance_due, status")
        .eq("business_id", business.id)
        .limit(5000),
    ]);
    setSales(s ?? []);
    setExpenses(e ?? []);
    setDebtors(d ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
    if (!business?.id) return;
    // Realtime is centralised in AppSyncManager; subscribe to its window events
    // instead of opening another postgres_changes channel per Reports mount.
    const onChange = () => { void fetchAll(); };
    window.addEventListener("zampos:sales-changed", onChange);
    window.addEventListener("zampos:expenses-changed", onChange);
    window.addEventListener("zampos:debtors-changed", onChange);
    window.addEventListener("zampos:sync-complete", onChange);
    return () => {
      window.removeEventListener("zampos:sales-changed", onChange);
      window.removeEventListener("zampos:expenses-changed", onChange);
      window.removeEventListener("zampos:debtors-changed", onChange);
      window.removeEventListener("zampos:sync-complete", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, range.from, range.to]);


  const stats = useMemo(() => {
    const active = sales.filter((s) => s.status !== "refunded");
    const revenue = active.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const tax = active.reduce((sum, s) => sum + (Number(s.tax_amount) || 0), 0);
    const cogs = active.reduce((sum, s) => {
      const items = Array.isArray(s.items) ? s.items : [];
      return sum + items.reduce((c: number, it: any) => c + (Number(it.costPrice) || 0) * (Number(it.quantity) || 0), 0);
    }, 0);
    const businessExp = expenses.filter((e) => e.category !== "personal").reduce((s, e) => s + Number(e.amount || 0), 0);
    const drawings = expenses.filter((e) => e.category === "personal").reduce((s, e) => s + Number(e.amount || 0), 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - businessExp;
    const outstanding = debtors.reduce((s, d) => s + Number(d.balance_due || 0), 0);
    const byPayment: Record<string, number> = {};
    active.forEach((s) => {
      const k = s.payment_method || "unknown";
      byPayment[k] = (byPayment[k] || 0) + Number(s.total || 0);
    });
    const byCashier: Record<string, { count: number; revenue: number }> = {};
    active.forEach((s) => {
      const k = s.cashier_name || "Owner";
      const cur = byCashier[k] || { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(s.total || 0);
      byCashier[k] = cur;
    });
    return { revenue, tax, cogs, grossProfit, netProfit, businessExp, drawings, outstanding, count: active.length, byPayment, byCashier };
  }, [sales, expenses, debtors]);

  const exportCsv = () => {
    const rows: string[] = [];
    rows.push("ZamPOS Report");
    rows.push(`Business,${business?.name ?? ""}`);
    rows.push(`Period,${period}`);
    rows.push(`From,${format(range.from, "yyyy-MM-dd HH:mm")}`);
    rows.push(`To,${format(range.to, "yyyy-MM-dd HH:mm")}`);
    rows.push("");
    rows.push("Metric,Value");
    rows.push(`Sales count,${stats.count}`);
    rows.push(`Revenue,${stats.revenue.toFixed(2)}`);
    rows.push(`Tax collected,${stats.tax.toFixed(2)}`);
    rows.push(`Cost of goods,${stats.cogs.toFixed(2)}`);
    rows.push(`Gross profit,${stats.grossProfit.toFixed(2)}`);
    rows.push(`Business expenses,${stats.businessExp.toFixed(2)}`);
    rows.push(`Owner drawings,${stats.drawings.toFixed(2)}`);
    rows.push(`Net profit,${stats.netProfit.toFixed(2)}`);
    rows.push(`Outstanding debtors,${stats.outstanding.toFixed(2)}`);
    rows.push("");
    rows.push("Payment Method,Total");
    Object.entries(stats.byPayment).forEach(([k, v]) => rows.push(`${k},${v.toFixed(2)}`));
    rows.push("");
    rows.push("Cashier,Sales,Revenue");
    Object.entries(stats.byCashier).forEach(([k, v]) => rows.push(`${k},${v.count},${v.revenue.toFixed(2)}`));

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zampos-report-${period}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report exported" });
  };

  if (authLoading || bizLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!business) return null;

  return (
    <>
      <ConnectionStatus />
      <div className="min-h-screen bg-background safe-area-inset">
        <header className="bg-card border-b border-border px-4 py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}><ArrowLeft className="w-5 h-5" /></Button>
              <div>
                <h1 className="font-display font-bold text-lg">Reports</h1>
                <p className="text-xs text-muted-foreground">Sales, profit & cash flow</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> CSV</Button>
          </div>
        </header>

        <main className="p-4 max-w-4xl mx-auto space-y-4">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
              <TabsTrigger value="month">This Month</TabsTrigger>
            </TabsList>
          </Tabs>

          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Loading...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Revenue" value={formatZMW(stats.revenue)} />
                <StatCard icon={<ShoppingCart className="w-4 h-4" />} label="Sales" value={stats.count.toString()} />
                <StatCard icon={<Receipt className="w-4 h-4" />} label="Tax Collected" value={formatZMW(stats.tax)} />
                <StatCard icon={<Wallet className="w-4 h-4" />} label="Cost of Goods" value={formatZMW(stats.cogs)} />
                <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Gross Profit" value={formatZMW(stats.grossProfit)} />
                <StatCard icon={<Wallet className="w-4 h-4" />} label="Business Expenses" value={formatZMW(stats.businessExp)} />
                <StatCard icon={<Wallet className="w-4 h-4" />} label="Owner Drawings" value={formatZMW(stats.drawings)} />
                <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Net Profit" value={formatZMW(stats.netProfit)} highlight />
                <StatCard icon={<AlertCircle className="w-4 h-4" />} label="Outstanding Debts" value={formatZMW(stats.outstanding)} />
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">By Payment Method</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {Object.keys(stats.byPayment).length === 0 && <p className="text-muted-foreground">No sales in this period.</p>}
                  {Object.entries(stats.byPayment).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span className="capitalize">{k.replace(/_/g, " ")}</span><span>{formatZMW(v)}</span></div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">By Cashier</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {Object.keys(stats.byCashier).length === 0 && <p className="text-muted-foreground">No sales in this period.</p>}
                  {Object.entries(stats.byCashier).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span>{k}</span><span>{v.count} sales · {formatZMW(v.revenue)}</span></div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>
    </>
  );
};

const StatCard = ({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) => (
  <Card className={highlight ? "border-primary" : undefined}>
    <CardContent className="p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <div className={`font-bold ${highlight ? "text-primary text-lg" : ""}`}>{value}</div>
    </CardContent>
  </Card>
);

export default Reports;
