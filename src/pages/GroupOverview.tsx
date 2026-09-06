import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, TrendingUp, Receipt, Wallet, Users, Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBusinessContext } from '@/hooks/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { formatZMW } from '@/lib/currency';
import { toast } from '@/components/ui/use-toast';

interface BranchOverviewRow {
  business_id: string;
  business_name: string;
  sales_count: number;
  sales_total: number;
  expenses_total: number;
  debtors_owed: number;
  stock_value: number;
  stock_items: number;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

const num = (v: unknown): number => (isNumber(v) ? v : Number(v ?? 0) || 0);

export const GroupOverview = () => {
  const navigate = useNavigate();
  const { businesses, isMultiBranch, isLoading, switchBranch } = useBusinessContext();
  const [rows, setRows] = useState<BranchOverviewRow[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);

  const loadOverview = useCallback(async () => {
    if (!isMultiBranch || businesses.length === 0) return;
    setLoadingOverview(true);
    const ids = businesses.map((b) => b.id);
    const { data, error } = await supabase.rpc('get_branch_overview', { p_business_ids: ids });
    if (error) {
      console.error('get_branch_overview failed:', error);
      toast({ variant: 'destructive', title: 'Could not load overview', description: error.message });
      setLoadingOverview(false);
      return;
    }
    if (data) {
      setRows(
        (data as unknown as Array<Record<string, unknown>>).map((r) => ({
          business_id: r.business_id as string,
          business_name: r.business_name as string,
          sales_count: num(r.sales_count),
          sales_total: num(r.sales_total),
          expenses_total: num(r.expenses_total),
          debtors_owed: num(r.debtors_owed),
          stock_value: num(r.stock_value),
          stock_items: num(r.stock_items),
        }))
      );
    }
    setLoadingOverview(false);
  }, [isMultiBranch, businesses]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const jumpToBranch = async (id: string) => {
    await switchBranch(id);
    navigate('/dashboard');
  };

  if (!isMultiBranch) {
    return null;
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.sales_total += r.sales_total;
      acc.sales_count += r.sales_count;
      acc.expenses_total += r.expenses_total;
      acc.debtors_owed += r.debtors_owed;
      acc.stock_value += r.stock_value;
      acc.stock_items += r.stock_items;
      return acc;
    },
    { sales_total: 0, sales_count: 0, expenses_total: 0, debtors_owed: 0, stock_value: 0, stock_items: 0 }
  );

  return (
    <div className="min-h-screen bg-background safe-area-inset">
      <header className="bg-card border-b border-border px-4 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-display font-bold text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" /> All Branches
              </h1>
              <p className="text-xs text-muted-foreground">Head office overview across {businesses.length} locations</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadOverview()} disabled={loadingOverview}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto space-y-4">
        {/* Group totals */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Sales</p>
                <p className="font-bold">{formatZMW(totals.sales_total)}</p>
                <p className="text-[10px] text-muted-foreground">{totals.sales_count} sales</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center"><Wallet className="w-4 h-4 text-red-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Expenses</p>
                <p className="font-bold">{formatZMW(totals.expenses_total)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center"><Users className="w-4 h-4 text-amber-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Debtors Owed</p>
                <p className="font-bold">{formatZMW(totals.debtors_owed)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center"><Package className="w-4 h-4 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Stock Value</p>
                <p className="font-bold">{formatZMW(totals.stock_value)}</p>
                <p className="text-[10px] text-muted-foreground">{totals.stock_items} items</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center"><Receipt className="w-4 h-4 text-green-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Locations</p>
                <p className="font-bold">{businesses.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Per-branch breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Per-Branch Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading overview…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Debtors</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.business_id} className="cursor-pointer" onClick={() => void jumpToBranch(r.business_id)}>
                        <TableCell className="font-medium">{r.business_name}</TableCell>
                        <TableCell className="text-right">
                          {formatZMW(r.sales_total)}
                          <span className="block text-[10px] text-muted-foreground">{r.sales_count} sales</span>
                        </TableCell>
                        <TableCell className="text-right">{formatZMW(r.expenses_total)}</TableCell>
                        <TableCell className="text-right">{formatZMW(r.debtors_owed)}</TableCell>
                        <TableCell className="text-right">
                          {formatZMW(r.stock_value)}
                          <span className="block text-[10px] text-muted-foreground">{r.stock_items} items</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading && <p className="text-xs text-muted-foreground text-center">Loading business data…</p>}
      </main>
    </div>
  );
};
