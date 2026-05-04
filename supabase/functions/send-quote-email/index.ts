import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      to, clientName, contractorName, companyName, quoteNumber, total, quoteUrl, message, isInvoice,
      emailSubject, emailIntro, emailButtonText, emailReplyTo, emailFooter
    } = await req.json();

    if (!to || !quoteUrl) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, quoteUrl" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "Email service not configured. Please add RESEND_API_KEY to Supabase secrets." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const escapeHtml = (value: unknown) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const withBreaks = (value: unknown) => escapeHtml(value).replace(/\n/g, "<br>");

    const fromName = companyName || contractorName || "QuoteDr";
    const greeting = clientName ? `Hi ${clientName},` : "Hi there,";
    const quoteRef = quoteNumber ? `${isInvoice ? "Invoice" : "Quote"} #${quoteNumber}` : (isInvoice ? "Your Invoice" : "Your Quote");
    const totalStr = total ? `$${parseFloat(total).toFixed(2)}` : "";
    const docType = isInvoice ? "invoice" : "quote";
    const customMessage = message ? `<p style="color:#555; line-height:1.6;">${withBreaks(message)}</p>` : "";

    const subject = emailSubject
      ? String(emailSubject).replace("{quoteRef}", quoteRef).replace("{company}", fromName).replace("{total}", totalStr)
      : `${quoteRef} from ${fromName}${totalStr ? " - " + totalStr : ""}`;

    const introParagraph = emailIntro
      ? `<p style="color:#555; line-height:1.6; margin:0 0 24px;">${withBreaks(emailIntro)}</p>`
      : `<p style="color:#555; line-height:1.6; margin:0 0 24px;">${escapeHtml(contractorName || fromName || "Your contractor")} has sent you ${escapeHtml(quoteRef)}${totalStr ? ` for <strong>${escapeHtml(totalStr)}</strong>` : ""}. Click below to view your ${docType}.</p>`;

    const btnText = emailButtonText || (isInvoice ? "View Invoice" : "View Quote");
    const replyTo = emailReplyTo || undefined;
    const footerExtra = emailFooter ? `<br>${withBreaks(emailFooter)}` : "";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f4f4f4; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4; padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#0f3460,#1a56a0); padding:32px 40px; text-align:center;">
          <div style="font-size:2rem; font-weight:800; color:white; letter-spacing:-1px;">${escapeHtml(fromName)}</div>
          <div style="color:rgba(255,255,255,0.8); font-size:0.9rem; margin-top:4px;">${escapeHtml(quoteRef)}</div>
        </td></tr>

        <tr><td style="padding:40px;">
          <p style="font-size:1.1rem; font-weight:600; color:#0f3460; margin:0 0 16px;">${escapeHtml(greeting)}</p>
          ${customMessage}
          ${introParagraph}

          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 32px;">
            <a href="${escapeHtml(quoteUrl)}" style="display:inline-block; background:#e87e2a; color:white; font-weight:700; font-size:1rem; padding:16px 40px; border-radius:50px; text-decoration:none; letter-spacing:0.3px;">
              ${escapeHtml(btnText)}
            </a>
          </td></tr></table>

          ${quoteNumber || totalStr ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa; border-radius:8px; margin-bottom:24px;">
            <tr><td style="padding:20px;">
              ${quoteNumber ? `<div style="margin-bottom:8px;"><span style="color:#999; font-size:0.85rem;">${isInvoice ? "Invoice" : "Quote"} Number</span><br><strong style="color:#333;">#${escapeHtml(quoteNumber)}</strong></div>` : ""}
              ${totalStr ? `<div><span style="color:#999; font-size:0.85rem;">Total</span><br><strong style="color:#0f3460; font-size:1.2rem;">${escapeHtml(totalStr)}</strong></div>` : ""}
            </td></tr>
          </table>` : ""}

          <p style="color:#999; font-size:0.8rem; margin:0;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${escapeHtml(quoteUrl)}" style="color:#1a56a0; word-break:break-all;">${escapeHtml(quoteUrl)}</a>
          </p>
        </td></tr>

        <tr><td style="background:#f8f9fa; padding:20px 40px; text-align:center; border-top:1px solid #eee;">
          <p style="color:#aaa; font-size:0.75rem; margin:0;">
            Sent by ${escapeHtml(fromName)}${footerExtra}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <quotes@quotedr.io>`,
        to: [to],
        subject,
        html,
        reply_to: replyTo,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || JSON.stringify(result));
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
