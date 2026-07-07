
CREATE POLICY "Cashiers can view their business"
  ON public.businesses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.business_cashiers c
    WHERE c.business_id = businesses.id
      AND c.auth_user_id = auth.uid()
      AND c.is_active = true
  ));
