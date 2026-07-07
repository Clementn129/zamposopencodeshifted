import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProductCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export function useProductCategories(businessId: string | undefined) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!businessId) {
      setCategories([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name, sort_order")
        .eq("business_id", businessId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      setCategories(
        (data ?? []).map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }))
      );
    } catch {
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (name: string): Promise<string | null> => {
      if (!businessId) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;

      // Avoid duplicate (case-insensitive)
      const existing = categories.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) return existing.name;

      const { error } = await supabase
        .from("product_categories")
        .insert({ business_id: businessId, name: trimmed });
      if (error && !/duplicate/i.test(error.message)) {
        throw error;
      }
      await refetch();
      return trimmed;
    },
    [businessId, categories, refetch]
  );

  return { categories, isLoading, refetch, create };
}
