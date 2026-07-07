import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cacheProducts, getCachedProducts, getUnsyncedSales, getUnsyncedStockUpdates } from "@/lib/offlineStorage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { Database } from "@/integrations/supabase/types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CachedProduct = Parameters<typeof cacheProducts>[0][number];

export type ItemType = 'product' | 'service';

export type Product = {
  id: string;
  businessId: string;
  name: string;
  price: number;
  costPrice: number | null;
  stock: number;
  minimumStock: number;
  category: string | null;
  barcode: string | null;
  isActive: boolean;
  itemType: ItemType;
  taxCategory: 'taxable' | 'zero_rated' | 'exempt';
  imageUrl: string | null;     // resolved signed URL ready for <img src>
  imagePath: string | null;    // raw storage path stored on the row
  parentId: string | null;
  variantLabel: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const mapRowToProduct = (row: ProductRow): Product => ({
  id: row.id,
  businessId: row.business_id,
  name: row.name,
  price: Number(row.price),
  costPrice: row.cost_price ? Number(row.cost_price) : null,
  stock: Number(row.stock),
  minimumStock: Number(row.minimum_stock ?? 5),
  category: row.category,
  barcode: (row as any).barcode ?? null,
  isActive: row.is_active,
  itemType: (((row as any).item_type ?? 'product') === 'service' ? 'service' : 'product'),
  taxCategory: (row.tax_category ?? 'taxable') as Product['taxCategory'],
  imageUrl: null,
  imagePath: (row as any).image_url ?? null,
  parentId: (row as any).parent_id ?? null,
  variantLabel: (row as any).variant_label ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCachedProduct = (p: CachedProduct): Product => ({
  id: p.id,
  businessId: p.businessId,
  name: p.name,
  price: Number(p.price ?? 0),
  costPrice: p.costPrice ?? null,
  stock: Number(p.stock ?? 0),
  minimumStock: Number(p.minimumStock ?? 5),
  category: p.category ?? null,
  barcode: (p as any).barcode ?? null,
  isActive: p.isActive !== false,
  itemType: (((p as any).itemType ?? 'product') === 'service' ? 'service' : 'product'),
  taxCategory: ((p as any).taxCategory ?? 'taxable') as Product['taxCategory'],
  imageUrl: (p as any).imageUrl ?? null,
  imagePath: (p as any).imagePath ?? null,
  parentId: (p as any).parentId ?? null,
  variantLabel: (p as any).variantLabel ?? null,
});

// Resolve product-images storage paths to signed URLs in one round trip.
// We use a 1-year expiry so URLs are effectively permanent for caching/CDN
// purposes — the workspace blocks public buckets, so this is the longest-lived
// option without exposing the bucket.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // ~1 year

const PAGE_SIZE = 100;

// Batch signed URL creation. Supabase caps a single call at a few hundred
// paths and the JSON payload for 20k+ items would be huge; chunking keeps
// each request small and lets us fail-soft on individual chunks.
const SIGNED_URL_CHUNK = 100;

const resolveImageUrls = async (products: Product[]): Promise<Product[]> => {
  const paths = Array.from(
    new Set(products.map((p) => p.imagePath).filter((x): x is string => !!x))
  );
  if (paths.length === 0) return products;

  const urlByPath = new Map<string, string>();
  for (let i = 0; i < paths.length; i += SIGNED_URL_CHUNK) {
    const chunk = paths.slice(i, i + SIGNED_URL_CHUNK);
    try {
      const { data } = await supabase.storage
        .from("product-images")
        .createSignedUrls(chunk, SIGNED_URL_TTL_SECONDS);
      if (data) {
        for (const item of data) {
          if (item.signedUrl && item.path) {
            urlByPath.set(item.path, item.signedUrl);
          }
        }
      }
    } catch {
      // ignore chunk failure — remaining products just render without an image
    }
  }

  if (urlByPath.size === 0) return products;
  return products.map((p) =>
    p.imagePath && urlByPath.has(p.imagePath)
      ? { ...p, imageUrl: urlByPath.get(p.imagePath) ?? null }
      : p
  );
};

export function useProducts(businessId: string | undefined) {
  const { isOnline } = useOnlineStatus();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // POS-facing list: hide parents that have active variants (parent is just a grouping)
  // and always exclude inactive products.
  const activeProducts = useMemo(() => {
    const parentIdsWithVariants = new Set(
      products
        .filter((p) => p.isActive && p.parentId)
        .map((p) => p.parentId as string)
    );
    return products.filter(
      (p) => p.isActive && !parentIdsWithVariants.has(p.id)
    );
  }, [products]);

  const searchProductsServerSide = useCallback(async (
    businessId: string,
    query: string,
    offset: number = 0,
    limit: number = PAGE_SIZE
  ): Promise<{ data: Product[]; total: number }> => {
    try {
      let dbQuery = supabase
        .from("products")
        .select("id, business_id, name, price, cost_price, stock, minimum_stock, category, is_active, tax_category, image_url, parent_id, variant_label, item_type, created_at, updated_at", { count: "exact" })
        .eq("business_id", businessId)
        .eq("is_active", true);

      if (query.trim()) {
        const q = query.trim();
        dbQuery = dbQuery.or(`name.ilike.%${q}%,category.ilike.%${q}%,barcode.ilike.%${q}%`);
      }

      const { data, error: fetchError, count } = await dbQuery
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (fetchError) throw fetchError;
      return { data: (data ?? []).map(mapRowToProduct), total: count ?? 0 };
    } catch (e) {
      console.error("Server-side product search failed:", e);
      return { data: [], total: 0 };
    }
  }, []);

  const refetch = useCallback(async () => {
    if (!businessId) {
      setProducts([]);
      setIsLoading(false);
      return;
    }

    setProducts((prev) => {
      if (prev.length === 0) setIsLoading(true);
      return prev;
    });
    setError(null);

    try {
      if (isOnline) {
        const [unsyncedSales, unsyncedStockUpdates] = await Promise.all([
          getUnsyncedSales(businessId),
          getUnsyncedStockUpdates(businessId),
        ]);

        if (unsyncedSales.length > 0 || unsyncedStockUpdates.length > 0) {
          const cached = await getCachedProducts(businessId);
          setProducts(cached.map(mapCachedProduct));
          setIsLoading(false);
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("products")
          .select("id, business_id, name, price, cost_price, stock, minimum_stock, category, is_active, tax_category, image_url, parent_id, variant_label, item_type, created_at, updated_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(25000);

        if (fetchError) throw fetchError;

        const mapped = (data ?? []).map(mapRowToProduct);
        // Render immediately without image URLs so 20k+ catalogs paint fast;
        // signed URLs resolve in the background and swap in when ready.
        setProducts(mapped);
        setIsLoading(false);

        const withUrls = await resolveImageUrls(mapped);
        setProducts(withUrls);

        await cacheProducts(
          withUrls.map((p) => ({
            id: p.id,
            businessId: p.businessId,
            name: p.name,
            price: p.price,
            costPrice: p.costPrice,
            stock: p.stock,
            minimumStock: p.minimumStock,
            category: p.category,
            isActive: p.isActive,
            itemType: p.itemType,
            taxCategory: p.taxCategory,
            imageUrl: p.imageUrl,
            imagePath: p.imagePath,
            parentId: p.parentId,
            variantLabel: p.variantLabel,
          }) as any)
        );
      } else {
        const cached = await getCachedProducts(businessId);
        setProducts(cached.map(mapCachedProduct));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load products";
      try {
        const cached = businessId ? await getCachedProducts(businessId) : [];
        setProducts(cached.map(mapCachedProduct));
        setError(cached.length ? null : msg);
      } catch {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [businessId, isOnline]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    const handler = () => {
      void refetch();
    };
    window.addEventListener("zampos:sync-complete", handler);
    return () => window.removeEventListener("zampos:sync-complete", handler);
  }, [refetch]);

  return {
    products,
    activeProducts,
    isLoading,
    error,
    isOnline,
    refetch,
    searchProductsServerSide,
  };
}
