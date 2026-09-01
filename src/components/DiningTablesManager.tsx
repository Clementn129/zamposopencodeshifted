import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useDiningTables, DiningTable } from "@/hooks/useDiningTables";

interface Props {
  businessId?: string;
}

const DiningTablesManager = ({ businessId }: Props) => {
  const { toast } = useToast();
  const { tables, isLoading, createTable, updateTable, deleteTable } = useDiningTables(businessId);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [floor, setFloor] = useState("");
  const [capacity, setCapacity] = useState("2");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFloor, setEditFloor] = useState("");
  const [editCapacity, setEditCapacity] = useState("2");

  useEffect(() => {
    if (!adding) return;
    setName("");
    setFloor("");
    setCapacity("2");
  }, [adding]);

  const grouped = useMemo(() => {
    const byFloor: Record<string, DiningTable[]> = {};
    for (const t of tables) {
      const key = t.floor?.trim() ?? "";
      (byFloor[key] ??= []).push(t);
    }
    const keys = Object.keys(byFloor).sort((a, b) => a.localeCompare(b));
    return keys.map((key) => ({ floor: key, items: byFloor[key].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)) }));
  }, [tables]);

  const startEdit = (t: DiningTable) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditFloor(t.floor ?? "");
    setEditCapacity(String(t.capacity));
  };

  const saveNew = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Table name is required" });
      return;
    }
    const created = await createTable({ name, floor, capacity: parseInt(capacity, 10) || 2 });
    if (!created) {
      toast({ variant: "destructive", title: "Could not add table", description: "That name may already exist." });
      return;
    }
    toast({ title: "Table added" });
    setAdding(false);
  };

  const saveEdit = async (t: DiningTable) => {
    if (!editName.trim()) {
      toast({ variant: "destructive", title: "Table name is required" });
      return;
    }
    const ok = await updateTable(t.id, {
      name: editName.trim(),
      floor: editFloor.trim() ? editFloor.trim() : null,
      capacity: parseInt(editCapacity, 10) || t.capacity,
    });
    if (!ok) {
      toast({ variant: "destructive", title: "Could not save table" });
      return;
    }
    toast({ title: "Saved" });
    setEditingId(null);
  };

  const remove = async (t: DiningTable) => {
    if (!window.confirm(`Delete "${t.name}"? Past sales will keep their records (they just detach from the table).`)) return;
    const ok = await deleteTable(t.id);
    if (ok) toast({ title: "Table deleted" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Dining Tables
        </CardTitle>
        <CardDescription>
          Your floor plan. Tables appear in the POS and floor-plan screens so orders can be assigned to them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading tables…</p>
        ) : (
          <>
            {!adding && (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add table
              </Button>
            )}

            {adding && (
              <div className="space-y-2 border border-border rounded-lg p-3">
                <Label>New table</Label>
                <div className="flex gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Table 1" />
                  <Input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Floor / area (e.g. Patio)" />
                  <Input
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="Seats"
                    className="w-20"
                    aria-label="Seating capacity"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveNew}>
                    <Check className="h-4 w-4" /> Add
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </div>
              </div>
            )}

            {tables.length === 0 && !adding && (
              <p className="text-sm text-muted-foreground">No tables yet. Add your first table to start assigning orders.</p>
            )}

            {grouped.map(({ floor: floorName, items }) => (
              <div key={floorName}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {floorName || "General"}
                </p>
                <div className="space-y-1.5">
                  {items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-3 py-2">
                      {editingId === t.id ? (
                        <div className="flex flex-1 gap-2 items-center">
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-32" />
                          <Input value={editFloor} onChange={(e) => setEditFloor(e.target.value)} className="w-32" placeholder="Floor / area" />
                          <Input
                            type="number"
                            min={1}
                            value={editCapacity}
                            onChange={(e) => setEditCapacity(e.target.value)}
                            className="w-16"
                            aria-label="Seats"
                          />
                          <Button size="sm" variant="outline" onClick={() => saveEdit(t)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground">Seats {t.capacity}{t.floor ? ` · ${t.floor}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Active</span>
                              <Switch
                                checked={t.is_active}
                                onCheckedChange={(checked) => void updateTable(t.id, { is_active: checked })}
                              />
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => startEdit(t)} aria-label="Edit table">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => remove(t)} aria-label="Delete table">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DiningTablesManager;