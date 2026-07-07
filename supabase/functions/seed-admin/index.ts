import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const email = "zampos129@gmail.com";
  const password = "Jokermind12@";

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

  return new Response(JSON.stringify({ ok: true, user_id: userId, email }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
