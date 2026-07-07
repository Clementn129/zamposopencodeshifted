
-- 1. Stock adjustment requests table
CREATE TABLE public.stock_adjustment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requester_name text,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('add','remove')),
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sar_business_status ON public.stock_adjustment_requests(business_id, status);
CREATE INDEX idx_sar_product ON public.stock_adjustment_requests(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustment_requests TO authenticated;
GRANT ALL ON public.stock_adjustment_requests TO service_role;

ALTER TABLE public.stock_adjustment_requests ENABLE ROW LEVEL SECURITY;

-- Anyone in the business can view their requests
CREATE POLICY "Business members can view adjustment requests"
  ON public.stock_adjustment_requests FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

-- Anyone in the business can create a request (forced to pending + requested_by = self)
CREATE POLICY "Business members can create adjustment requests"
  ON public.stock_adjustment_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_business_member(business_id)
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

-- Only owners can update (approve/reject) requests for their business
CREATE POLICY "Owners can update adjustment requests"
  ON public.stock_adjustment_requests FOR UPDATE
  TO authenticated
  USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));

-- Only owners can delete requests
CREATE POLICY "Owners can delete adjustment requests"
  ON public.stock_adjustment_requests FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

CREATE TRIGGER update_sar_updated_at
  BEFORE UPDATE ON public.stock_adjustment_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Approve RPC: owner-only, applies delta and marks approved atomically
CREATE OR REPLACE FUNCTION public.approve_stock_adjustment(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid;
  v_product uuid;
  v_variant uuid;
  v_type text;
  v_qty integer;
  v_status text;
  v_target uuid;
  v_delta integer;
BEGIN
  SELECT business_id, product_id, variant_id, adjustment_type, quantity, status
    INTO v_biz, v_product, v_variant, v_type, v_qty, v_status
    FROM public.stock_adjustment_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF v_biz IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.owns_business(v_biz) THEN RAISE EXCEPTION 'Only the business owner can approve'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Request already %', v_status; END IF;

  v_target := COALESCE(v_variant, v_product);
  v_delta := CASE WHEN v_type = 'add' THEN v_qty ELSE -v_qty END;

  UPDATE public.products
    SET stock = GREATEST(stock + v_delta, 0), updated_at = now()
    WHERE id = v_target AND business_id = v_biz;

  UPDATE public.stock_adjustment_requests
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = p_note
    WHERE id = p_request_id;

  RETURN p_request_id;
END;
$$;

-- 3. Reject RPC
CREATE OR REPLACE FUNCTION public.reject_stock_adjustment(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid;
  v_status text;
BEGIN
  SELECT business_id, status INTO v_biz, v_status
    FROM public.stock_adjustment_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF v_biz IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.owns_business(v_biz) THEN RAISE EXCEPTION 'Only the business owner can reject'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Request already %', v_status; END IF;

  UPDATE public.stock_adjustment_requests
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = p_note
    WHERE id = p_request_id;

  RETURN p_request_id;
END;
$$;
