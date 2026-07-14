import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log("=== EXTEND SUBSCRIPTION ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const businessId = body.businessId;
    const months = body.months;

    console.log("Request body:", JSON.stringify(body));

    if (!businessId || !months) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing businessId or months" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("SUPABASE_URL:", supabaseUrl ? "set" : "MISSING");
    console.log("SUPABASE_SERVICE_ROLE_KEY:", supabaseKey ? "set" : "MISSING");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const monthsNum = typeof months === "number" ? months : parseInt(String(months), 10) || 1;
    const now = new Date();
    const addMs = monthsNum * 30 * 24 * 60 * 60 * 1000;

    // Read current expiry
    const { data: biz, error: readErr } = await supabase
      .from("businesses")
      .select("subscription_expires_at")
      .eq("id", businessId)
      .maybeSingle();

    console.log("Business read:", JSON.stringify(biz), "error:", JSON.stringify(readErr));

    if (!biz) {
      return new Response(
        JSON.stringify({ error: "Business not found", businessId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentExpiry = biz.subscription_expires_at ? new Date(biz.subscription_expires_at).getTime() : now.getTime();
    const baseMs = currentExpiry > now.getTime() ? currentExpiry : now.getTime();
    const newExpiryMs = baseMs + addMs;

    const newExpiry = new Date(newExpiryMs).toISOString();
    console.log("New expiry:", newExpiry);

    const { data: updateData, error: updateErr } = await supabase
      .from("businesses")
      .update({
        subscription_expires_at: newExpiry,
        subscription_status: "active",
        is_locked: false,
      })
      .eq("id", businessId)
      .select("id, subscription_expires_at, subscription_status, is_locked");

    console.log("Update result:", JSON.stringify(updateData), "error:", JSON.stringify(updateErr));

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Failed to update", details: updateErr }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        newExpiry,
        subscriptionStatus: "active",
        updated: updateData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Extend error:", error?.message || String(error));
    return new Response(
      JSON.stringify({ error: "Internal error", message: error?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
