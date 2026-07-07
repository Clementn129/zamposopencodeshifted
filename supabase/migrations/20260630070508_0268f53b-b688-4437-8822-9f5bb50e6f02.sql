-- Remove the hard 3-cashier cap; pricing now scales with active cashier count.
DROP TRIGGER IF EXISTS enforce_cashier_cap_trigger ON public.business_cashiers;
DROP TRIGGER IF EXISTS trg_enforce_cashier_cap ON public.business_cashiers;
DROP FUNCTION IF EXISTS public.enforce_cashier_cap();