import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Request = {
  id: string;
  product_id: string;
  variant_id: string | null;
  requester_name: string | null;
  adjustment_type: "add" | "remove";
  quantity: number;
  reason: string | null;
  created_at: string;
};

type ProductLite = { id: string; name: string };

type Props = {
  businessId: string;
  products: ProductLite[];
  onApproved?: () => void;
};

const PendingStockRequests = ({ businessId, products, onApproved }: Props) => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<Request[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("stock_adjustment_requests")
      .select("id, product_id, variant_id, requester_name, adjustment_type, quantity, reason, created_at")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setRequests((data ?? []) as Request[]);
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    void load();
  }, [businessId, load]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "Unknown product";

  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      const fn = approve ? "approve_stock_adjustment" : "reject_stock_adjustment";
      const { error } = await supabase.rpc(fn, {
        p_request_id: id,
        p_note: notes[id] || null,
      });
      if (error) throw error;
      toast({ title: approve ? "Approved" : "Rejected" });
      await load();
      if (approve) onApproved?.();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Pending Stock Adjustments
          <Badge variant="secondary">{requests.length}</Badge>
        </CardTitle>
        <CardDescription>Cashier-submitted changes waiting for your approval</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="bg-secondary rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-medium truncate">{productName(r.product_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {r.adjustment_type === "add" ? "Add" : "Remove"}{" "}
                  <span className="font-medium text-foreground">{r.quantity}</span>
                  {r.requester_name ? ` • by ${r.requester_name}` : ""} •{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
                {r.reason && <p className="text-xs text-muted-foreground mt-1 italic">"{r.reason}"</p>}
              </div>
              <Badge
                className={
                  r.adjustment_type === "add"
                    ? "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30"
                    : "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30"
                }
              >
                {r.adjustment_type === "add" ? "+" : "-"}
                {r.quantity}
              </Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Note (optional)"
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                className="h-8 text-xs flex-1 min-w-[160px]"
              />
              <Button
                size="sm"
                variant="pos"
                disabled={busy === r.id}
                onClick={() => review(r.id, true)}
              >
                {busy === r.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === r.id}
                onClick={() => review(r.id, false)}
              >
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default PendingStockRequests;
