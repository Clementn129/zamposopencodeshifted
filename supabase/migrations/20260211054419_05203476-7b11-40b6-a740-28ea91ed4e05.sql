
-- Add payout fields to affiliates table
ALTER TABLE public.affiliates
  ADD COLUMN payout_method text,
  ADD COLUMN payout_number text,
  ADD COLUMN payout_name text;

-- Add phone and full_name directly for affiliate-only users (who may not have a business)
ALTER TABLE public.affiliates
  ADD COLUMN phone text,
  ADD COLUMN full_name text;

-- Super admins can delete affiliates
CREATE POLICY "Super admins can delete affiliates"
ON public.affiliates
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Also allow cascade delete of referrals when affiliate is deleted
ALTER TABLE public.affiliate_referrals
  DROP CONSTRAINT affiliate_referrals_affiliate_id_fkey,
  ADD CONSTRAINT affiliate_referrals_affiliate_id_fkey
    FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE CASCADE;

-- Cascade delete commissions when affiliate is deleted
ALTER TABLE public.affiliate_commissions
  DROP CONSTRAINT affiliate_commissions_affiliate_id_fkey,
  ADD CONSTRAINT affiliate_commissions_affiliate_id_fkey
    FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE CASCADE;
