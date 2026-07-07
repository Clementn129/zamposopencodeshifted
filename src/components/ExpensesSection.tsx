import { useState, useEffect, useMemo } from 'react';
import { format, startOfDay, startOfMonth, endOfDay, endOfMonth } from 'date-fns';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// 'personal' in the DB now represents Owner Drawings (money the owner takes
// out for personal use). Both categories reduce available business cash, but
// only 'business' counts as a business expense in P&L.
type ExpenseCategory = 'business' | 'personal';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  business: 'Business Expense',
  personal: 'Owner Drawings',
};

type Expense = {
  id: string;
  name: string;
  amount: number;
  expenseDate: string;
  notes: string | null;
  category: ExpenseCategory;
};

type ExpensesSectionProps = {
  businessId: string;
  isOnline?: boolean;
  onExpenseChanged?: () => void;
};

const ExpensesSection = ({ businessId, isOnline = true, onExpenseChanged }: ExpensesSectionProps) => {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | ExpenseCategory>('all');

  // Form state
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('business');

  const fetchExpenses = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('business_id', businessId)
        .order('expense_date', { ascending: false });

      if (error) throw error;

      setExpenses((data || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        amount: Number(e.amount),
        expenseDate: e.expense_date,
        notes: e.notes,
        category: (e.category ?? 'business') as ExpenseCategory,
      })));
    } catch (e) {
      console.error('Failed to fetch expenses:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (businessId && isOnline) {
      fetchExpenses();
    }
  }, [businessId, isOnline]);

  const visibleExpenses = useMemo(
    () => (filter === 'all' ? expenses : expenses.filter(e => e.category === filter)),
    [expenses, filter]
  );

  // Totals are computed from business expenses only — personal/outside
  // expenses do not affect business P&L.
  const businessExpenses = useMemo(
    () => expenses.filter(e => e.category === 'business'),
    [expenses]
  );

  const todayExpenses = useMemo(() => {
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    return businessExpenses
      .filter(e => {
        const d = new Date(e.expenseDate);
        return d >= today && d <= todayEnd;
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [businessExpenses]);

  const monthExpenses = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    return businessExpenses
      .filter(e => {
        const d = new Date(e.expenseDate);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [businessExpenses]);

  const resetForm = () => {
    setName('');
    setAmount('');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
    setCategory('business');
  };

  const handleSave = async () => {
    if (!name.trim() || !amount) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Name and amount are required.' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('expenses').insert({
        business_id: businessId,
        name: name.trim(),
        amount: Number(amount),
        expense_date: expenseDate,
        notes: notes.trim() || null,
        category,
      } as any);

      if (error) throw error;

      toast({ title: 'Expense Added' });
      setOpen(false);
      resetForm();
      await fetchExpenses();
      onExpenseChanged?.();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not add expense' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return;

    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Expense Deleted' });
      await fetchExpenses();
      onExpenseChanged?.();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e?.message ?? 'Could not delete' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Expenses
            </CardTitle>
            <CardDescription>Business expenses & Owner Drawings (both reduce business cash)</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!isOnline}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">Business Expense (rent, fuel, stock, salaries…)</SelectItem>
                      <SelectItem value="personal">Owner Drawings (personal withdrawal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Rent, Utilities, etc." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Amount (ZMW)</Label>
                    <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details..." />
                </div>
                <Button variant="pos" className="w-full" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Expense'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-secondary rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Today (Business)</p>
            <p className="font-bold text-destructive">ZMW {todayExpenses.toFixed(2)}</p>
          </div>
          <div className="bg-secondary rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">This Month (Business)</p>
            <p className="font-bold text-destructive">ZMW {monthExpenses.toFixed(2)}</p>
          </div>
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="mb-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="personal">Owner Drawings</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : visibleExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No entries recorded.</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {visibleExpenses.slice(0, 10).map(exp => (
              <div key={exp.id} className="flex items-center justify-between bg-secondary rounded-lg p-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{exp.name}</p>
                    <Badge variant={exp.category === 'business' ? 'default' : 'outline'} className="text-[10px] py-0 px-1.5">
                      {CATEGORY_LABELS[exp.category]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {format(new Date(exp.expenseDate), 'MMM d, yyyy')}
                    {exp.notes && ` • ${exp.notes}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-destructive">-ZMW {exp.amount.toFixed(2)}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(exp.id)} disabled={!isOnline}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExpensesSection;
