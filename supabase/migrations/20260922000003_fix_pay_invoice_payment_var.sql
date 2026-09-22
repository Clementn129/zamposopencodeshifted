-- Fix a PL/pgSQL typo in pay_invoice: it referenced v_payment_method, which is
-- never declared. Undeclared identifiers inside SQL statements are treated as
-- columns, so marking an invoice as paid raised:
--   column "v_payment_method" does not exist
-- after the membership check passed. The parameter is p_payment_method.

CREATE OR REPLACE FUNCTION public.pay_invoice(
  p_invoice_id TEXT,
  p_payment_method TEXT DEFAULT 'cash'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_real UUID;
  v_biz UUID;
  v_status public.invoice_status;
  v_sale_id UUID;
  v_subtotal NUMERIC;
  v_total NUMERIC;
  v_discount_amount NUMERIC;
  v_discount_type TEXT;
  v_tax_amount NUMERIC;
  v_customer_name TEXT;
  v_customer_tpin TEXT;
  v_customer_phone TEXT;
  v_quotation_id UUID;
  v_delivery_note_id UUID;
  v_items JSONB;
  v_offline_id TEXT;
BEGIN
  BEGIN
    SELECT id INTO v_real FROM public.invoices WHERE id = p_invoice_id::uuid AND deleted_at IS NULL;
  EXCEPTION WHEN invalid_text_representation THEN
    v_real := NULL;
  END;
  IF v_real IS NULL THEN
    SELECT id INTO v_real FROM public.invoices WHERE offline_id = p_invoice_id AND deleted_at IS NULL;
  END IF;
  IF v_real IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT business_id, status, converted_sale_id, subtotal, total,
         COALESCE(discount_amount, 0), discount_type, COALESCE(tax_amount, 0),
         customer_name, customer_tpin, customer_phone, quotation_id, delivery_note_id
    INTO v_biz, v_status, v_sale_id, v_subtotal, v_total,
         v_discount_amount, v_discount_type, v_tax_amount,
         v_customer_name, v_customer_tpin, v_customer_phone, v_quotation_id, v_delivery_note_id
    FROM public.invoices WHERE id = v_real;

  IF v_biz IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_status = 'paid' AND v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  IF NOT public.is_business_member(v_biz) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'productId', product_id,
    'name', product_name,
    'price', unit_price,
    'quantity', quantity,
    'discountType', discount_type,
    'discountValue', discount_value,
    'lineTotal', line_total
  )), '[]'::jsonb) INTO v_items
  FROM public.invoice_items WHERE invoice_id = v_real;

  v_offline_id := 'inv_' || v_real::text;

  v_sale_id := public.sync_offline_sale(
    v_biz, v_offline_id, v_items, v_subtotal, v_total,
    v_discount_amount, v_discount_type, p_payment_method, now(),
    v_tax_amount, 0, 0, 0, v_customer_name, v_customer_tpin,
    v_total, NULL, v_customer_phone, NULL
  );

  UPDATE public.invoices
    SET status = 'paid', payment_method = p_payment_method,
        converted_sale_id = v_sale_id, updated_at = now()
    WHERE id = v_real;

  IF v_quotation_id IS NOT NULL THEN
    UPDATE public.quotations
      SET status = 'converted', converted_sale_id = v_sale_id, updated_at = now()
      WHERE id = v_quotation_id;
  END IF;

  IF v_delivery_note_id IS NOT NULL THEN
    UPDATE public.delivery_notes
      SET status = 'invoiced', updated_at = now()
      WHERE id = v_delivery_note_id;
  END IF;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_invoice(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_invoice(text, text) TO anon;