import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMenuModifiers, ModifierGroup, MenuModifier } from "@/hooks/useMenuModifiers";
import type { Product } from "@/hooks/useProducts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId?: string;
  products: Product[];
}

const defaultMax = (g: ModifierGroup) => g.max_selections;

const MenuModifiersManager = ({ open, onOpenChange, businessId, products }: Props) => {
  const { toast } = useToast();
  const {
    groups,
    modifiersByGroup,
    groupIdsByProduct,
    isLoading,
    createGroup,
    updateGroup,
    deleteGroup,
    createModifier,
    updateModifier,
    deleteModifier,
    setProductGroups,
  } = useMenuModifiers(businessId);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMin, setGroupMin] = useState("0");
  const [groupMax, setGroupMax] = useState("1");

  const [addingModifierFor, setAddingModifierFor] = useState<string | null>(null);
  const [modifierName, setModifierName] = useState("");
  const [modifierPrice, setModifierPrice] = useState("0");

  const [linksForProduct, setLinksForProduct] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEditingGroupId(null);
      setGroupName("");
      setGroupMin("0");
      setGroupMax("1");
      setAddingModifierFor(null);
      setLinksForProduct(null);
    }
  }, [open]);

  const startEditGroup = (g: ModifierGroup) => {
    setEditingGroupId(g.id);
    setGroupName(g.name);
    setGroupMin(String(g.min_selections));
    setGroupMax(String(g.max_selections));
  };

  const saveGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Missing name" });
      return;
    }
    const min = Math.max(0, parseInt(groupMin, 10) || 0);
    const max = Math.max(min, parseInt(groupMax, 10) || 1);
    if (editingGroupId) {
      const ok = await updateGroup(editingGroupId, { name, min_selections: min, max_selections: max });
      if (!ok) return toast({ variant: "destructive", title: "Could not save group" });
    } else {
      const created = await createGroup(name, { min, max });
      if (!created) return toast({ variant: "destructive", title: "Could not create group" });
    }
    toast({ title: "Saved" });
    setGroupName("");
    setGroupMin("0");
    setGroupMax("1");
    setEditingGroupId(null);
  };

  const saveModifier = async (group: ModifierGroup) => {
    const name = modifierName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Missing option name" });
      return;
    }
    const price = Number(modifierPrice) || 0;
    const created = await createModifier(group, name, price);
    if (!created) return toast({ variant: "destructive", title: "Could not add option" });
    toast({ title: "Option added" });
    setModifierName("");
    setModifierPrice("0");
    setAddingModifierFor(null);
  };

  const toggleProductLink = (productId: string, groupId: string) => {
    const current = groupIdsByProduct[productId] ?? [];
    const next = current.includes(groupId)
      ? current.filter((g) => g !== groupId)
      : [...current, groupId];
    void setProductGroups(productId, next);
  };

  const removeModifier = async (m: MenuModifier) => {
    const ok = await deleteModifier(m.id);
    if (ok) toast({ title: "Option removed" });
  };

  const removeGroup = async (g: ModifierGroup) => {
    const ok = await deleteGroup(g.id);
    if (ok) toast({ title: "Group removed" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle>Menu Modifiers</DialogTitle>
          <DialogDescription>
            Create option groups (e.g. Size, Extras) and attach them to menu items.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {/* New / edit group */}
            <div className="space-y-2 border border-border rounded-lg p-3">
              <Label>{editingGroupId ? "Edit group" : "New group"}</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Size" />
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Min selections</Label>
                  <Input type="number" value={groupMin} onChange={(e) => setGroupMin(e.target.value)} />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Max selections</Label>
                  <Input type="number" value={groupMax} onChange={(e) => setGroupMax(e.target.value)} />
                </div>
                <Button size="sm" className="mt-5" onClick={saveGroup}>
                  {editingGroupId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
              {editingGroupId && (
                <Button variant="ghost" size="sm" onClick={() => setEditingGroupId(null)}>
                  <X className="h-4 w-4" /> Cancel
                </Button>
              )}
            </div>

            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No modifier groups yet. Add one above.</p>
            )}

            {groups.map((g) => (
              <div key={g.id} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.min_selections}–{defaultMax(g)} selections
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEditGroup(g)} aria-label="Edit group">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeGroup(g)} aria-label="Delete group">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Modifiers in this group */}
                <div className="space-y-1">
                  {(modifiersByGroup[g.id] ?? []).map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded px-2 py-1">
                      <span className="text-sm">{m.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {m.price_adjustment > 0 ? `+K${m.price_adjustment.toFixed(2)}` : m.price_adjustment < 0 ? `-K${Math.abs(m.price_adjustment).toFixed(2)}` : "No charge"}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => removeModifier(m)} aria-label="Delete option">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {addingModifierFor === g.id ? (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Option name</Label>
                      <Input value={modifierName} onChange={(e) => setModifierName(e.target.value)} placeholder="e.g. Extra cheese" />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs text-muted-foreground">Price +/–</Label>
                      <Input type="number" value={modifierPrice} onChange={(e) => setModifierPrice(e.target.value)} />
                    </div>
                    <Button size="sm" onClick={() => saveModifier(g)} aria-label="Add option">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => { setAddingModifierFor(g.id); setModifierName(""); setModifierPrice("0"); }}>
                    <Plus className="h-4 w-4" /> Add option
                  </Button>
                )}

                {/* Attach to menu items */}
                <div className="pt-1 border-t border-dashed border-border">
                  <Label className="text-xs text-muted-foreground">Attached to menu items</Label>
                  {linksForProduct !== g.id ? (
                    <Button variant="ghost" size="sm" className="block" onClick={() => setLinksForProduct(g.id)}>
                      Choose items…
                    </Button>
                  ) : (
                    <div className="space-y-1 mt-1">
                      <Select value="" onValueChange={(v) => { if (v) toggleProductLink(v, g.id); }}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select an item to attach…" />
                        </SelectTrigger>
                        <SelectContent>
                          {products
                            .filter((p) => !p.parentId)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(groupIdsByProduct)
                          .filter(([pid, ids]) => ids.includes(g.id))
                          .map(([pid]) => {
                            const p = products.find((x) => x.id === pid);
                            return (
                              <button
                                key={pid}
                                onClick={() => toggleProductLink(pid, g.id)}
                                className="flex items-center gap-1 text-xs bg-secondary rounded-full px-2 py-1 hover:opacity-80"
                                title="Click to remove"
                              >
                                {p?.name ?? pid}
                                <X className="h-3 w-3" />
                              </button>
                            );
                          })}
                        {Object.entries(groupIdsByProduct).filter(([pid, ids]) => ids.includes(g.id)).length === 0 && (
                          <span className="text-xs text-muted-foreground">Not attached to any item.</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MenuModifiersManager;