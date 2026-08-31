import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Wallet, Coins, AlertTriangle, PackageX, Boxes } from "lucide-react";
import type { Product } from "@/hooks/useProducts";

type StockFilter = 'all' | 'low' | 'out';

type Props = {
  products: Product[];
  /** When true, render only the stock-count tiles (for non-stock-tracked services). */
  stockOnly?: boolean;
  /** Currently applied stock filter (only Low Stock / Out of Stock tiles filter). */
  activeFilter?: StockFilter;
  /** Called when a stock tile is clicked; pass `'all'` to clear the filter. */
  onFilterChange?: (filter: StockFilter) => void;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-ZM", { maximumFractionDigits: 2 }).format(n);

const InventoryDashboard = ({ products, stockOnly = false, activeFilter = 'all', onFilterChange }: Props) => {
  const stats = useMemo(() => {
    // Sellable products only — variants count, parent-groupings are excluded.
    const parentIds = new Set(
      products.filter((p) => p.isActive && p.parentId).map((p) => p.parentId as string)
    );
    const sellable = products.filter(
      (p) => p.isActive && !parentIds.has(p.id)
    );
    // Services don't track stock; keep them in item count but exclude from stock stats.
    const stocked = sellable.filter((p) => p.itemType !== "service");

    let costValue = 0;
    let retailValue = 0;
    let lowStock = 0;
    let outOfStock = 0;

    for (const p of stocked) {
      const stock = p.stock ?? 0;
      const cost = p.costPrice ?? 0;
      const price = p.price ?? 0;
      costValue += cost * stock;
      retailValue += price * stock;
      if (stock <= 0) outOfStock += 1;
      else if (stock <= (p.minimumStock ?? 5)) lowStock += 1;
    }

    return {
      itemCount: sellable.length,
      costValue,
      retailValue,
      profit: retailValue - costValue,
      lowStock,
      outOfStock,
    };
  }, [products]);

  const tiles = (stockOnly
    ? [
        { icon: Boxes, label: "Items", value: String(stats.itemCount), tone: "text-foreground", filter: 'all' as StockFilter, clickable: true },
        { icon: AlertTriangle, label: "Low Stock", value: String(stats.lowStock), tone: "text-amber-600", filter: 'low' as StockFilter, clickable: true },
        { icon: PackageX, label: "Out of Stock", value: String(stats.outOfStock), tone: "text-destructive", filter: 'out' as StockFilter, clickable: true },
      ]
    : [
        { icon: Wallet, label: "Cost Value", value: `K ${fmt(stats.costValue)}`, tone: "text-foreground", filter: null as StockFilter | null, clickable: false },
        { icon: Coins, label: "Retail Value", value: `K ${fmt(stats.retailValue)}`, tone: "text-foreground", filter: null, clickable: false },
        {
          icon: TrendingUp,
          label: "Expected Profit",
          value: `K ${fmt(stats.profit)}`,
          tone: stats.profit >= 0 ? "text-emerald-600" : "text-destructive",
          filter: null,
          clickable: false,
        },
        { icon: Boxes, label: "Items", value: String(stats.itemCount), tone: "text-foreground", filter: 'all' as StockFilter, clickable: true },
        { icon: AlertTriangle, label: "Low Stock", value: String(stats.lowStock), tone: "text-amber-600", filter: 'low' as StockFilter, clickable: true },
        { icon: PackageX, label: "Out of Stock", value: String(stats.outOfStock), tone: "text-destructive", filter: 'out' as StockFilter, clickable: true },
      ]);

  const handleClick = (tile: (typeof tiles)[number]) => {
    if (!tile.clickable || !onFilterChange) return;
    onFilterChange(tile.filter === activeFilter ? 'all' : tile.filter ?? 'all');
  };

  return (
    <div
      className={`grid gap-2 ${
        stockOnly ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      }`}
    >
      {tiles.map((t) => {
        const isActive = t.clickable && t.filter === activeFilter;
        return (
          <Card
            key={t.label}
            className={t.clickable ? "cursor-pointer transition hover:opacity-90" : undefined}
            onClick={() => handleClick(t)}
          >
            <CardContent
              className={`p-3 ${isActive ? "ring-2 ring-primary rounded-xl" : ""}`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </div>
              <p className={`font-display font-bold text-base sm:text-lg mt-1 ${t.tone}`}>
                {t.value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default InventoryDashboard;
