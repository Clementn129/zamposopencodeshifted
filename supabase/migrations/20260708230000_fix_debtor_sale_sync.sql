-- Fix desynced sales where debtors are paid but sales still show pending
UPDATE public.sales s
SET amount_paid = LEAST(d.amount_paid, s.total),
    balance_due = GREATEST(s.total - d.amount_paid, 0),
    payment_status = (CASE
      WHEN d.amount_paid >= s.total THEN 'paid'::sale_payment_status
      WHEN d.amount_paid > 0 THEN 'partially_paid'::sale_payment_status
      ELSE 'pending'::sale_payment_status
    END)
FROM public.debtors d
WHERE d.sale_id = s.id
  AND d.amount_paid > s.amount_paid;
