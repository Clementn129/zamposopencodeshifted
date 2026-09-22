-- Parity fix: quotation_items allows members to delete (needed for the
-- delete-then-reinsert item replacement used when editing quotes/invoices),
-- but invoice_items delete was accidentally owner-only. Relax it to members so
-- cashiers can edit invoice lines like they can for quotations.

DROP POLICY IF EXISTS "Owners can delete invoice items" ON public.invoice_items;

CREATE POLICY "Members can delete invoice items" ON public.invoice_items
  FOR DELETE
  USING (
    invoice_id IN (
      SELECT i.id FROM public.invoices i
      WHERE public.is_business_member(i.business_id)
    )
  );