-- =====================================================
-- Harden multi-branch RPCs: Postgres grants EXECUTE to
-- PUBLIC by default on new functions. These SECURITY
-- DEFINER RPCs would otherwise be callable by the anon
-- role, where auth.uid() is NULL and the owner checks
-- (X <> NULL) silently pass. Restrict execution to the
-- authenticated role only, matching repo convention.
-- =====================================================

REVOKE EXECUTE ON FUNCTION public.get_my_business_group() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_branch(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_branch_overview(uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_business_group() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_branch(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_overview(uuid[]) TO authenticated;