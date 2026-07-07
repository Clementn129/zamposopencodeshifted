-- 1. Add minimum_stock column to products table for low stock alerts
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS minimum_stock integer NOT NULL DEFAULT 5;

-- 2. Add status column to sales table for refund tracking (completed, refunded, partially_refunded)
-- Create the enum type first
DO $$ BEGIN
  CREATE TYPE public.sale_status AS ENUM ('completed', 'refunded', 'partially_refunded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS status public.sale_status NOT NULL DEFAULT 'completed';

-- 3. Add discount columns to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_type text DEFAULT NULL; -- 'percentage' or 'amount'

-- 4. Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- RLS policy for expenses - users can manage their own business expenses
CREATE POLICY "Users can manage own expenses"
  ON public.expenses
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- 5. Create debtors table for credit sales
CREATE TABLE IF NOT EXISTS public.debtors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  amount_owed NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on debtors
ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;

-- RLS policy for debtors
CREATE POLICY "Users can manage own debtors"
  ON public.debtors
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- 6. Create debtor_payments table for tracking payments
CREATE TABLE IF NOT EXISTS public.debtor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id UUID NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on debtor_payments
ALTER TABLE public.debtor_payments ENABLE ROW LEVEL SECURITY;

-- RLS policy for debtor_payments
CREATE POLICY "Users can manage own debtor payments"
  ON public.debtor_payments
  FOR ALL
  TO authenticated
  USING (debtor_id IN (
    SELECT d.id FROM public.debtors d 
    JOIN public.businesses b ON d.business_id = b.id 
    WHERE b.user_id = auth.uid()
  ));

-- Add trigger for updated_at on expenses
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on debtors
CREATE TRIGGER update_debtors_updated_at
  BEFORE UPDATE ON public.debtors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();