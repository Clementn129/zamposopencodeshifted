import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log("=== LIPILA PAYMENT REQUEST ===");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify({ ...body, phone: body.phone?.slice(-4) }));
    const { businessId, phone, amount, months, referenceId } = body;

    if (!businessId || !phone || !amount || !months || !referenceId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lipilaKey = Deno.env.get("LIPILA_API_KEY");
    console.log("Lipila key:", lipilaKey ? lipilaKey.substring(0, 8) + "..." : "MISSING");

    if (!lipilaKey) {
      return new Response(
        JSON.stringify({ error: "Lipila credentials not configured. Contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone to 260XXXXXXXXX
    let formattedPhone = phone.replace(/\s/g, "");
    if (!formattedPhone.startsWith("260") && formattedPhone.length === 9) {
      formattedPhone = `260${formattedPhone}`;
    }
    if (formattedPhone.startsWith("0")) {
      formattedPhone = `260${formattedPhone.substring(1)}`;
    }

    const lipilaRefId = crypto.randomUUID();
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/lipila-webhook`;

    // Call Lipila mobile money collection endpoint
    const lipilaUrl = "https://blz.lipila.io/api/v1/collections/mobile-money";
    console.log("Calling Lipila:", lipilaUrl, "phone:", formattedPhone, "amt:", amount);

    const lipilaResp = await fetch(lipilaUrl, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "Content-Type": "application/json",
        "x-api-key": lipilaKey,
        "callbackUrl": callbackUrl,
      },
      body: JSON.stringify({
        referenceId: lipilaRefId,
        amount,
        narration: `ZamPOS Subscription - ${months} month${months > 1 ? "s" : ""}`,
        accountNumber: formattedPhone,
        currency: "ZMW",
        referenceData: JSON.stringify({ businessId, referenceId, months }),
      }),
    });

    console.log("Lipila status:", lipilaResp.status, lipilaResp.statusText);

    let lipilaData: any;
    try {
      lipilaData = await lipilaResp.json();
    } catch {
      const text = await lipilaResp.text();
      console.error("Lipila non-JSON response:", text);
      lipilaData = { message: text || "Payment initiation failed" };
    }
    console.log("Lipila response:", JSON.stringify(lipilaData));

    if (!lipilaResp.ok) {
      return new Response(
        JSON.stringify({ error: lipilaData.message || "Payment initiation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store payment record
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const lipilaStatus = lipilaData.status === "Successful" ? "Successful" : lipilaData.status === "Failed" ? "Failed" : "Pending";
    const identifier = lipilaData.identifier || null;

    await supabase.from("subscription_payments").insert({
      business_id: businessId,
      reference_id: referenceId,
      amount,
      months,
      phone: formattedPhone,
      status: lipilaStatus,
      lipila_identifier: lipilaRefId,
      lipila_external_id: identifier,
      created_at: new Date().toISOString(),
    });

    console.log("Payment stored, status:", lipilaStatus);

    if (lipilaData.status === "Successful") {
      return new Response(
        JSON.stringify({
          status: "Successful",
          referenceId,
          transactionId: lipilaRefId,
          message: "Payment successful!",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        status: "Pending",
        referenceId,
        transactionId: lipilaRefId,
        message: "Payment initiated. Customer will receive a prompt on their phone.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Lipila payment error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
