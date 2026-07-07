-- Restore production payment-status triggers that should exist for sales and debtors.

CREATE OR REPLACE FUNCTION public.set_sale_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.amount_paid IS NULL THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid < 0 THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid > NEW.total THEN NEW.amount_paid := NEW.total; END IF;

  NEW.balance_due := GREATEST(NEW.total - NEW.amount_paid, 0);

  IF NEW.balance_due = 0 THEN
    NEW.payment_status := 'paid';
  ELSIF NEW.amount_paid = 0 THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'pending';
    END IF;
  ELSE
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'partially_paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_set_payment_status ON public.sales;
CREATE TRIGGER trg_sales_set_payment_status
  BEFORE INSERT OR UPDATE OF total, amount_paid, due_date
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sale_payment_status();

CREATE OR REPLACE FUNCTION public.set_debtor_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.amount_paid IS NULL THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid < 0 THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid > NEW.amount_owed THEN NEW.amount_paid := NEW.amount_owed; END IF;

  IF NEW.amount_paid >= NEW.amount_owed THEN
    NEW.status := 'paid';
  ELSIF NEW.amount_paid = 0 THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.status := 'overdue';
    ELSE
      NEW.status := 'unpaid';
    END IF;
  ELSE
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.status := 'overdue';
    ELSE
      NEW.status := 'partially_paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_debtor_status ON public.debtors;
CREATE TRIGGER trg_set_debtor_status
  BEFORE INSERT OR UPDATE OF amount_owed, amount_paid, due_date
  ON public.debtors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_debtor_status();

-- Recalculate existing rows in place so old data displays correctly.
UPDATE public.sales
SET amount_paid = amount_paid
WHERE true;

UPDATE public.debtors
SET amount_paid = amount_paid
WHERE true;

REVOKE EXECUTE ON FUNCTION public.set_sale_payment_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_sale_payment_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_debtor_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_debtor_status() FROM anon;