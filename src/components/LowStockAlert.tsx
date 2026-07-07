import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type Product = {
  id: string;
  name: string;
  stock: number;
  minimumStock: number;
};

type LowStockAlertProps = {
  businessId: string;
};

const LowStockAlert = ({ businessId }: LowStockAlertProps) => {
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);

  useEffect(() => {
    const fetchLowStock = async () => {
      if (!businessId) return;

      const { data, error } = await supabase
        .from('products')
        .select('id, name, stock, minimum_stock, item_type')
        .eq('business_id', businessId)
        .eq('is_active', true);

      if (!error && data) {
        const lowStock = data
          .filter((p: any) => (p.item_type ?? 'product') !== 'service' && Number(p.stock) <= Number(p.minimum_stock || 5))
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            stock: Number(p.stock),
            minimumStock: Number(p.minimum_stock || 5),
          }));
        setLowStockProducts(lowStock);
      }
    };

    fetchLowStock();
  }, [businessId]);

  if (lowStockProducts.length === 0) return null;

  return (
    <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" /> Low Stock Alert
        </CardTitle>
        <CardDescription>{lowStockProducts.length} product(s) need restocking</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {lowStockProducts.map(p => (
            <Link to="/products" key={p.id}>
              <div className="flex items-center justify-between bg-background rounded-lg p-2 hover:bg-secondary transition">
                <span className="font-medium text-sm">{p.name}</span>
                <Badge variant="destructive" className="text-xs">
                  {p.stock} left (min: {p.minimumStock})
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default LowStockAlert;