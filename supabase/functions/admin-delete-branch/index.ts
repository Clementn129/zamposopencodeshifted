import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  // Verify caller is a super admin
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await caller.auth.getUser();
  if (userErr || !user) return json({ error: "Not authenticated" }, 401);

  const { data: roles } = await caller
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (!roles?.some((r) => r.role === "super_admin")) {
    return json({ error: "Not authorized" }, 403);
  }

  let body;
  try { body = await req.json(); } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const branchId = String(body.branch_id ?? "");
  if (!branchId) return json({ error: "Missing branch_id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Fetch the branch to verify it exists and is a child (not a root)
  const { data: branch, error: branchErr } = await admin
    .from("businesses")
    .select("id, name, parent_business_id, user_id")
    .eq("id", branchId)
    .maybeSingle();

  if (branchErr) return json({ error: branchErr.message }, 500);
  if (!branch) return json({ error: "Branch not found" }, 404);
  if (!branch.parent_business_id) {
    return json({ error: "Cannot delete root business. Use admin-delete-business instead." }, 400);
  }

  try {
    // Delete cashier auth users for this branch
    const { data: cashiers, error: cashierErr } = await admin
      .from("business_cashiers")
      .select("auth_user_id")
      .eq("business_id", branch.id);
    if (cashierErr) throw cashierErr;

    for (const cashier of cashiers ?? []) {
      if (cashier.auth_user_id) {
        const { error } = await admin.auth.admin.deleteUser(cashier.auth_user_id);
        if (error) console.error(`Failed to delete cashier auth user ${cashier.auth_user_id}:`, error.message);
      }
    }

    // Delete the branch row — cascades to sales, expenses, products, etc.
    const { error: delErr } = await admin
      .from("businesses")
      .delete()
      .eq("id", branch.id);
    if (delErr) throw delErr;
  } catch (e) {
    console.error("Failed to delete branch:", e);
    return json({ error: e instanceof Error ? e.message : "Failed to delete branch" }, 500);
  }

  return json({ ok: true, deleted: branch.name });
});
