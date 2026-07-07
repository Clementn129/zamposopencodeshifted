CREATE UNIQUE INDEX IF NOT EXISTS sales_business_offline_id_unique
ON public.sales (business_id, offline_id)
WHERE offline_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_offline_sale(
  p_business_id uuid,
  p_offline_id text,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_created_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;

  SELECT id INTO v_sale_id
  FROM public.sales
  WHERE business_id = p_business_id
    AND offline_id = p_offline_id
  LIMIT 1;

  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  INSERT INTO public.sales (
    business_id,
    items,
    subtotal,
    total,
    discount_amount,
    discount_type,
    payment_method,
    synced,
    offline_id,
    created_at
  ) VALUES (
    p_business_id,
    p_items,
    p_subtotal,
    p_total,
    COALESCE(p_discount_amount, 0),
    p_discount_type,
    p_payment_method,
    true,
    p_offline_id,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'productId', '')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products
      SET stock = GREATEST(stock - v_quantity, 0),
          updated_at = now()
      WHERE id = v_product_id
        AND business_id = p_business_id;
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamptz) TO authenticated;