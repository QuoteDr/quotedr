const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Retained as a no-send compatibility endpoint. QuoteDr follow-ups now require
// an explicit, signed-in dashboard action and always use the client portal URL.
Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return json({
    error: "Automated direct quote follow-ups are retired. Use Email Portal Follow-up from the QuoteDr dashboard.",
    code: "portal_followup_required",
    sent: 0,
  }, 410);
});
