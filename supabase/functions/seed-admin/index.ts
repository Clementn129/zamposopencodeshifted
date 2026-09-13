import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-setup-key, x-client-info, apikey, content-type",
};

const ADMIN_SETUP_KEY = Deno.env.get("ADMIN_SETUP_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Fails closed: no secret configured => nobody can use this endpoint. This is
  // a one-time setup script; production installs should never leave it reachable.
  if (!ADMIN_SETUP_KEY) {
    return new Response(
      JSON.stringify({ error: "admin-setup is disabled. Set ADMIN_SETUP_KEY to enable it (or delete this function)." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // The secret can come as a header or in the body. Compare in constant time.
  const supplied =
    req.headers.get("x-admin-setup-key") ||
    (await req.json().catch(() => ({})).then((b) => (b as Record<string, unknown>).admin_setup_key ?? null));

  if (typeof supplied !== "string" || supplied.length !== ADMIN_SETUP_KEY.length) {
    return new Response(JSON.stringify({ error: "Invalid admin setup key" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < ADMIN_SETUP_KEY.length; i++) {
    mismatch |= supplied.charCodeAt(i) ^ ADMIN_SETUP_KEY.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return new Response(JSON.stringify({ error: "Invalid admin setup key" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only allow the exact env-configured credentials. Never trust a body email/password,
  // so an attacker who somehow leaks the secret still can't create an account of their
  // own choosing.
  const email = Deno.env.get("SEED_ADMIN_EMAIL");
  const password = Deno.env.get("SEED_ADMIN_PASSWORD");

  if (!email || !password) {
    return new Response(
      JSON.stringify({ error: "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Ensure email is in super admins allowlist
  await admin.from("super_admins_allowlist").upsert({ email }, { onConflict: "email" });

  // Check if user already exists
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);

  let userId: string;
  if (existing) {
    userId = existing.id;
    const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } else {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr || !created.user) return new Response(JSON.stringify({ error: cErr?.message ?? "create failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    userId = created.user.id;
  }

  // Ensure profile exists
  await admin.from("profiles").upsert({ user_id: userId, email, full_name: "Super Admin" }, { onConflict: "user_id" });

  // Ensure super_admin role (remove any other role first to be clean)
  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.from("user_roles").insert({ user_id: userId, role: "super_admin" });

  // Create a business so the admin can also use the regular dashboard
  const { data: existingBiz } = await admin
    .from("businesses")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!existingBiz) {
    const { data: paymentCode } = await admin.rpc("generate_payment_code");
    await admin.from("businesses").insert({
      user_id: userId,
      name: "My Shop",
      payment_code: paymentCode || "POS-ADMIN",
      subscription_status: "active",
      tax_mode: "inclusive",
    });
  }

  return new Response(JSON.stringify({ ok: true, user_id: userId, email }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});