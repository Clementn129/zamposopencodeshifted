
-- Fix privilege escalation: prevent non-super-admins from inserting into user_roles
CREATE POLICY "Restrict role insertion to super admins only"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Also restrict UPDATE to super admins only
CREATE POLICY "Restrict role updates to super admins only"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Restrict DELETE to super admins only
CREATE POLICY "Restrict role deletion to super admins only"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
