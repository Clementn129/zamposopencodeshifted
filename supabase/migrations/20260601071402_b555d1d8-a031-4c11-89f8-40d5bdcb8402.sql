
REVOKE EXECUTE ON FUNCTION public.create_quotation_with_items(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.convert_quotation_to_sale(uuid, text) FROM PUBLIC, anon;
