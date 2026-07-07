
-- Create quotation status enum
DO $$ BEGIN
  CREATE TYPE quotation_status AS ENUM ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create quotations table
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  quotation_number TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status quotation_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  expiry_date DATE,
  converted_sale_id UUID REFERENCES public.sales(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create quotation_items table
CREATE TABLE public.quotation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  discount_type TEXT,
  discount_value NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for quotations
CREATE POLICY "Users can manage own quotations"
ON public.quotations
FOR ALL
USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- RLS policies for quotation_items
CREATE POLICY "Users can manage own quotation items"
ON public.quotation_items
FOR ALL
USING (quotation_id IN (
  SELECT id FROM quotations WHERE business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  )
));

-- Auto-generate quotation number function
CREATE OR REPLACE FUNCTION public.generate_quotation_number(biz_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_year TEXT;
  next_seq INTEGER;
  new_number TEXT;
BEGIN
  current_year := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(quotation_number FROM 'QT-' || current_year || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM public.quotations
  WHERE business_id = biz_id
    AND quotation_number LIKE 'QT-' || current_year || '-%';
  
  new_number := 'QT-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
  RETURN new_number;
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_quotations_updated_at
BEFORE UPDATE ON public.quotations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
