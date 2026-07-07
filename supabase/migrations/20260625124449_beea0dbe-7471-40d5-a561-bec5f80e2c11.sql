
-- 1. Add the missing trigger on auth.users so signups create profile/role/business
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Seed the super admin allowlist
INSERT INTO public.super_admins_allowlist (email)
VALUES ('zampos129@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- 3. Backfill any existing auth users that were created before the trigger existed
DO $$
DECLARE u RECORD; new_payment_code TEXT; new_business_id UUID;
BEGIN
  FOR u IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (u.id, u.raw_user_meta_data->>'full_name', u.email)
    ON CONFLICT (user_id) DO NOTHING;

    IF EXISTS (SELECT 1 FROM public.super_admins_allowlist WHERE email = u.email) THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'business_owner')
      ON CONFLICT (user_id, role) DO NOTHING;

      IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE user_id = u.id) THEN
        new_payment_code := public.generate_payment_code();
        INSERT INTO public.businesses (
          user_id, name, payment_code, subscription_status,
          trial_started_at, subscription_expires_at
        ) VALUES (
          u.id,
          COALESCE(u.raw_user_meta_data->>'business_name', 'My Business'),
          new_payment_code,
          'trial',
          now(),
          now() + INTERVAL '3 days'
        );
      END IF;
    END IF;
  END LOOP;
END $$;
