-- Phase C: Kitchen Order Tickets (KOT) / Kitchen Display System.
-- 1) Adds a role to business_cashiers (cashier | kitchen_staff | manager) so
--    kitchen staff can log in and view the kitchen screen.
-- 2) A kitchen_orders table holds one ticket per restaurant sale.
-- 3) A trigger on sales INSERT auto-creates the ticket for restaurant
--    businesses (works for online sales and synced offline sales alike).
-- 4) update_kitchen_order_status RPC drives the status flow
--    pending -> preparing -> ready -> served (or cancelled).
-- Additive and backwards-compatible: existing rows default to 'cashier' and
-- non-restaurant businesses never generate tickets.

-- ---------------------------------------------------------------------------
-- 1. business_cashiers.role
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_cashiers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'cashier';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_business_cashier_role'
  ) THEN
    ALTER TABLE public.business_cashiers
      ADD CONSTRAINT chk_business_cashier_role
      CHECK (role IN ('cashier', 'kitchen_staff', 'manager'));
  END IF;
END $$;

-- Kitchen staff helper: an active staff member of the business whose role is
-- kitchen_staff or manager. SECURITY DEFINER mirrors is_business_member().
CREATE OR REPLACE FUNCTION public.is_kitchen_staff(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_cashiers c
    WHERE c.business_id = _business_id
      AND c.auth_user_id = auth.uid()
      AND c.is_active = true
      AND c.role IN ('kitchen_staff', 'manager')
  );
$$;

-- Extend get_my_role() to surface staff roles (matched BEFORE the generic
-- cashier branch).
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'super_admin') THEN 'super_admin'
    WHEN (SELECT role FROM public.business_cashiers
          WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1) = 'manager' THEN 'manager'
    WHEN (SELECT role FROM public.business_cashiers
          WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1) = 'kitchen_staff' THEN 'kitchen_staff'
    WHEN EXISTS (SELECT 1 FROM public.business_cashiers WHERE auth_user_id = auth.uid() AND is_active = true) THEN 'cashier'
    WHEN EXISTS (SELECT 1 FROM public.businesses WHERE user_id = auth.uid()) THEN 'owner'
    ELSE 'unknown'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2. kitchen_orders table
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.kitchen_ticket_seq;

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  ticket_number BIGINT NOT NULL DEFAULT nextval('public.kitchen_ticket_seq'),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_preparing_at TIMESTAMPTZ,
  marked_ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  UNIQUE (sale_id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_orders_business_status
  ON public.kitchen_orders (business_id, status);

GRANT SELECT ON public.kitchen_orders TO authenticated;
GRANT ALL ON public.kitchen_orders TO service_role;

ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members can view kitchen orders"
  ON public.kitchen_orders FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY "Owners can delete kitchen orders"
  ON public.kitchen_orders FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

-- ---------------------------------------------------------------------------
-- 3. Auto-create a ticket when a restaurant sale lands in the DB.
--    Wrapped so a ticket failure never fails the sale itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_ticket_on_sale_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_business_type TEXT;
BEGIN
  BEGIN
    SELECT business_type INTO v_business_type
    FROM public.businesses
    WHERE id = NEW.business_id;

    IF v_business_type = 'restaurant'
       AND jsonb_array_length(COALESCE(NEW.items, '[]'::jsonb)) > 0 THEN
      INSERT INTO public.kitchen_orders (business_id, sale_id, items)
      VALUES (NEW.business_id, NEW.id, COALESCE(NEW.items, '[]'::jsonb));
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'skipped kitchen ticket for sale %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kitchen_ticket_on_sale ON public.sales;
CREATE TRIGGER trg_kitchen_ticket_on_sale
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_ticket_on_sale_insert();

-- ---------------------------------------------------------------------------
-- 4. Status update RPC (validates caller, stamps transition timestamps).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_kitchen_order_status(p_order_id uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  IF p_status NOT IN ('pending', 'preparing', 'ready', 'served', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT business_id INTO v_business_id
  FROM public.kitchen_orders
  WHERE id = p_order_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  IF NOT (public.is_business_member(v_business_id)
          AND (public.owns_business(v_business_id) OR public.is_kitchen_staff(v_business_id))) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.kitchen_orders
  SET status = p_status,
      started_preparing_at = CASE WHEN p_status = 'preparing' AND started_preparing_at IS NULL THEN now() ELSE started_preparing_at END,
      marked_ready_at     = CASE WHEN p_status = 'ready'     AND marked_ready_at IS NULL THEN now() ELSE marked_ready_at END,
      served_at           = CASE WHEN p_status = 'served'    AND served_at IS NULL THEN now() ELSE served_at END,
      cancelled_at        = CASE WHEN p_status = 'cancelled' AND cancelled_at IS NULL THEN now() ELSE cancelled_at END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_kitchen_order_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_kitchen_order_status(uuid, text) TO service_role;

-- Allow the KDS screen to receive live ticket updates.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;