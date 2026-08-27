-- Update app_settings.subscription_price to reflect the new lowest pricing tier.
-- Pricing tiers are now: 1 cashier K200, 2-3 K350, 4 K500, 5+ custom.
-- The fixed pricePerMonthZmw is only retained as a legacy/"lowest tier" reference.
UPDATE public.app_settings SET subscription_price = 200;
