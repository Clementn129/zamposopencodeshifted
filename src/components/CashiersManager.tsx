import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, KeyRound, Power, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Cashier {
  id: string;
  username: string;
  display_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

import { getPricingTier } from '@/lib/paymentDetails';

interface Props {
  businessId: string;
  paymentCode: string;
}

const CashiersManager = ({ businessId, paymentCode }: Props) => {
  const { toast } = useToast();
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');

  // Reset PIN dialog
  const [resetTarget, setResetTarget] = useState<Cashier | null>(null);
  const [resetPin, setResetPin] = useState('');

  const fetchCashiers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('business_cashiers')
      .select('id, username, display_name, is_active, last_login_at, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to load cashiers', description: error.message });
    } else {
      setCashiers(data ?? []);
    }
    setLoading(false);
  }, [businessId, toast]);

  useEffect(() => {
    void fetchCashiers();
  }, [fetchCashiers]);

  const callFn = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-cashier', { body });
    if (error) {
      // Supabase wraps non-2xx into FunctionsHttpError; try to surface the JSON error
      let msg = error.message;
      const ctx = (error as unknown as { context?: { json?: () => Promise<{ error?: string; message?: string }> } }).context;
      try {
        const j = await ctx?.json?.();
        if (j?.message) msg = j.message;
        else if (j?.error) msg = j.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    return data;
  }, []);

  const activeCount = cashiers.filter(c => c.is_active).length;
  const currentTier = getPricingTier(activeCount);
  const nextTier = getPricingTier(activeCount + 1);

  const handleCreate = async () => {
    const username = newUsername.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,20}$/.test(username)) {
      toast({ variant: 'destructive', title: 'Invalid username', description: 'Use 2-20 letters, numbers or underscore.' });
      return;
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      toast({ variant: 'destructive', title: 'Invalid PIN', description: 'PIN must be 4-6 digits.' });
      return;
    }
    setBusy(true);
    try {
      await callFn({ action: 'create', username, pin: newPin, display_name: newName.trim() || null });
      toast({ title: 'Cashier added', description: `${username} can now sign in with their PIN.` });
      setCreateOpen(false);
      setNewUsername(''); setNewName(''); setNewPin('');
      await fetchCashiers();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not add cashier', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  const handleResetPin = async () => {
    if (!resetTarget) return;
    if (!/^\d{4,6}$/.test(resetPin)) {
      toast({ variant: 'destructive', title: 'Invalid PIN', description: 'PIN must be 4-6 digits.' });
      return;
    }
    setBusy(true);
    try {
      await callFn({ action: 'reset_pin', cashier_id: resetTarget.id, pin: resetPin });
      toast({ title: 'PIN reset', description: `New PIN for ${resetTarget.username} saved.` });
      setResetTarget(null); setResetPin('');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Could not reset PIN', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (c: Cashier) => {
    setBusy(true);
    try {
      await callFn({ action: 'set_active', cashier_id: c.id, is_active: !c.is_active });
      await fetchCashiers();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (c: Cashier) => {
    if (!confirm(`Delete cashier "${c.username}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await callFn({ action: 'delete', cashier_id: c.id });
      toast({ title: 'Cashier removed' });
      await fetchCashiers();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Cashiers</CardTitle>
            <CardDescription>
              Cashiers can sell at the till but can't edit products, stock, prices, expenses, debtors or settings.
            </CardDescription>
          </div>
          <Badge variant="secondary">{activeCount} active · K{currentTier.priceZmw}/mo</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-secondary/50 p-3 text-sm">
          <p className="font-medium">How cashiers sign in</p>
          <p className="text-muted-foreground mt-1">
            Share your <span className="font-mono font-semibold text-foreground">{paymentCode}</span> business code,
            their username, and PIN. They tap <span className="font-medium">"Cashier login"</span> on the sign-in screen.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : cashiers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No cashiers yet. Add one to let a worker use the till.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {cashiers.map(c => (
              <li key={c.id} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <p className="font-medium">{c.display_name || c.username}</p>
                  <p className="text-xs text-muted-foreground">
                    @{c.username} · {c.is_active ? <span className="text-green-600">Active</span> : <span className="text-muted-foreground">Disabled</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setResetTarget(c); setResetPin(''); }}>
                    <KeyRound className="h-4 w-4 mr-1" /> Reset PIN
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => handleToggleActive(c)}>
                    <Power className="h-4 w-4 mr-1" /> {c.is_active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => handleDelete(c)}>
                    <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-center text-muted-foreground">
          Current plan: <span className="font-semibold text-foreground">{currentTier.label} — K{currentTier.priceZmw}/mo</span>.
          {nextTier.priceZmw > currentTier.priceZmw && (
            <> Adding another cashier moves you to <span className="font-semibold text-foreground">{nextTier.label} (K{nextTier.priceZmw}/mo)</span>.</>
          )}
        </div>
        <Button variant="pos" className="w-full" onClick={() => setCreateOpen(true)} disabled={busy}>
          <Plus className="h-4 w-4 mr-1" /> Add Cashier
        </Button>
      </CardContent>


      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a cashier</DialogTitle>
            <DialogDescription>They'll sign in with the business code, username and PIN.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="c-username">Username</Label>
              <Input id="c-username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. mary01" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-name">Display name (optional)</Label>
              <Input id="c-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Mary Phiri" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-pin">PIN (4-6 digits)</Label>
              <Input id="c-pin" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="pos" onClick={handleCreate} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving…</> : 'Create cashier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset PIN for @{resetTarget?.username}</DialogTitle>
            <DialogDescription>Enter the new 4-6 digit PIN. Share it with the cashier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="reset-pin">New PIN</Label>
            <Input id="reset-pin" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={resetPin} onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetTarget(null)} disabled={busy}>Cancel</Button>
            <Button variant="pos" onClick={handleResetPin} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving…</> : 'Reset PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CashiersManager;
