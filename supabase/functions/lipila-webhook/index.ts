import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log("=== LIPILA WEBHOOK ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Webhook payload:", JSON.stringify(payload));

    const { referenceId, status, identifier, externalId, referenceData } = payload;

    if (!referenceId || !status) {
      return new Response(
        JSON.stringify({ error: "Missing referenceId or status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Find the payment by lipila_identifier (our referenceId sent to Lipila)
    const { data: payment, error: lookupErr } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("lipila_identifier", referenceId)
      .maybeSingle();

    if (lookupErr || !payment) {
      console.error("Payment not found for lipila reference:", referenceId);
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found payment:", payment.reference_id, "current status:", payment.status);

    const mappedStatus = status === "Successful" ? "Successful" : "Failed";

    // Update payment record
    const updateData: Record<string, any> = {
      status: mappedStatus,
      lipila_external_id: externalId || identifier || null,
    };

    await supabase
      .from("subscription_payments")
      .update(updateData)
      .eq("id", payment.id);

    // If successful, extend subscription (fire-and-forget extend-subscription)
    if (mappedStatus === "Successful" && payment.business_id && payment.months) {
      console.log("Extending subscription for business:", payment.business_id);
      try {
        const monthsNum = typeof payment.months === "number" ? payment.months : parseInt(String(payment.months), 10) || 1;
        const addMs = monthsNum * 30 * 24 * 60 * 60 * 1000;
        const now = new Date();

        const { data: biz } = await supabase
          .from("businesses")
          .select("subscription_expires_at")
          .eq("id", payment.business_id)
          .maybeSingle();

        const currentExpiry = biz?.subscription_expires_at ? new Date(biz.subscription_expires_at).getTime() : now.getTime();
        const baseMs = currentExpiry > now.getTime() ? currentExpiry : now.getTime();
        const newExpiry = new Date(baseMs + addMs).toISOString();

        const { error: updateErr } = await supabase
          .from("businesses")
          .update({
            subscription_expires_at: newExpiry,
            subscription_status: "active",
            is_locked: false,
          })
          .eq("id", payment.business_id);

        if (updateErr) {
          console.error("Failed to extend subscription:", updateErr);
        } else {
          console.log("Subscription extended to:", newExpiry);
        }
      } catch (e) {
        console.error("Extension error:", e);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
