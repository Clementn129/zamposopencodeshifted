-- Allow super admins to delete businesses
CREATE POLICY "Super admins can delete businesses"
ON public.businesses
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Also need to handle cascade deletes for related tables
-- When a business is deleted, related records should be cleaned up

-- Add ON DELETE CASCADE to products table foreign key
ALTER TABLE public.products 
DROP CONSTRAINT IF EXISTS products_business_id_fkey;

ALTER TABLE public.products
ADD CONSTRAINT products_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to sales table foreign key
ALTER TABLE public.sales 
DROP CONSTRAINT IF EXISTS sales_business_id_fkey;

ALTER TABLE public.sales
ADD CONSTRAINT sales_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to debtors table foreign key
ALTER TABLE public.debtors 
DROP CONSTRAINT IF EXISTS debtors_business_id_fkey;

ALTER TABLE public.debtors
ADD CONSTRAINT debtors_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to expenses table foreign key
ALTER TABLE public.expenses 
DROP CONSTRAINT IF EXISTS expenses_business_id_fkey;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to payments table foreign key
ALTER TABLE public.payments 
DROP CONSTRAINT IF EXISTS payments_business_id_fkey;

ALTER TABLE public.payments
ADD CONSTRAINT payments_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to notices table foreign key (for targeted notices)
ALTER TABLE public.notices 
DROP CONSTRAINT IF EXISTS notices_target_business_id_fkey;

ALTER TABLE public.notices
ADD CONSTRAINT notices_target_business_id_fkey 
FOREIGN KEY (target_business_id) 
REFERENCES public.businesses(id) 
ON DELETE SET NULL;