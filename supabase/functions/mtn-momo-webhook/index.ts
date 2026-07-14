import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-content",
};

/**
 * MTN MoMo Webhook - Receives payment status callback
 *
 * MTN sends:
 * {
 *   externalId: string,      // our referenceId
 *   financialTransactionId: string,  // MTN's transaction ID
 *   amount: string,
 *   currency: string,
 *   payer: { partyIdType, partyId },
 *   status: "SUCCESSFUL" | "FAILED" | "TIMEOUT" | "REJECTED",
 *   reason?: string
 * }
 */

Deno.serve(async (req) => {
  console.log("=== MTN MOMO WEBHOOK ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Webhook payload:", JSON.stringify(body));

    const { externalId, financialTransactionId, status, reason } = body;

    if (!externalId) {
      console.error("No externalId in webhook");
      return new Response(
        JSON.stringify({ error: "Missing externalId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Map MTN status to our status
    let paymentStatus: string;
    switch (status?.toUpperCase()) {
      case "SUCCESSFUL":
        paymentStatus = "Successful";
        break;
      case "FAILED":
      case "REJECTED":
      case "TIMEOUT":
        paymentStatus = "Failed";
        break;
      default:
        paymentStatus = "Pending";
    }

    console.log("Updating payment:", { externalId, paymentStatus, financialTransactionId });

    // Update subscription_payments record
    const { error: updateError, data } = await supabase
      .from("subscription_payments")
      .update({
        status: paymentStatus,
        lipila_identifier: financialTransactionId || undefined,
      })
      .eq("reference_id", externalId)
      .select("business_id, months")
      .maybeSingle();

    if (updateError) {
      console.error("Failed to update payment:", updateError);
    }

    // If payment successful, extend subscription
    if (paymentStatus === "Successful" && data) {
      console.log("Payment successful, extending subscription for business:", data.business_id);

      const { data: biz, error: bizError } = await supabase
        .from("businesses")
        .select("subscription_expires_at")
        .eq("id", data.business_id)
        .maybeSingle();

      if (bizError) {
        console.error("Failed to fetch business:", bizError);
      } else if (biz) {
        const now = new Date();
        const currentExpiry = biz.subscription_expires_at ? new Date(biz.subscription_expires_at) : now;
        // If expired, start from now; otherwise extend from current expiry
        const baseDate = currentExpiry > now ? currentExpiry : now;
        const newExpiry = new Date(baseDate);
        newExpiry.setMonth(newExpiry.getMonth() + (data.months || 1));

        const { error: extendError } = await supabase
          .from("businesses")
          .update({
            subscription_expires_at: newExpiry.toISOString(),
            subscription_status: "active",
          })
          .eq("id", data.business_id);

        if (extendError) {
          console.error("Failed to extend subscription:", extendError);
        } else {
          console.log("Subscription extended to:", newExpiry.toISOString());
        }
      }
    }

    // Acknowledge receipt
    return new Response(
      JSON.stringify({ status: "received" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
