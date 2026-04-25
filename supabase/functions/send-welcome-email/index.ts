import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, name } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing required field: email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const firstName = name ? name.split(' ')[0] : 'there';

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to QuoteDr!</title>
</head>
<body style="margin:0; padding:0; background:#f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:white; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a56a0, #1a2940); padding: 36px 40px; text-align:center;">
              <h1 style="margin:0; color:white; font-size:28px; font-weight:700; letter-spacing:-0.5px;">QuoteDr</h1>
              <p style="margin:8px 0 0; color:rgba(255,255,255,0.8); font-size:14px;">Professional Renovation Quoting</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 40px 32px;">
              <h2 style="margin:0 0 16px; color:#1a2940; font-size:22px;">Welcome, ${firstName}! 🎉</h2>
              <p style="margin:0 0 16px; color:#444; font-size:15px; line-height:1.6;">
                Thanks for signing up for QuoteDr — you're going to love how much easier it makes quoting jobs and sending invoices to clients.
              </p>
              <p style="margin:0 0 24px; color:#444; font-size:15px; line-height:1.6;">
                Here's what you can do to get started:
              </p>

              <!-- Steps -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:12px 16px; background:#f0f4ff; border-radius:8px; margin-bottom:10px; display:block;">
                    <span style="color:#1a56a0; font-weight:700;">1.</span> <strong>Set up your business profile</strong> — add your company name, logo, and contact info in <a href="https://quotedr.io/settings.html" style="color:#1a56a0;">Settings</a>.
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px; background:#f0f4ff; border-radius:8px;">
                    <span style="color:#1a56a0; font-weight:700;">2.</span> <strong>Add your pricing items</strong> — build your personal price list so quoting is fast. Open the Quote Builder → Manage Items.
                  </td>
                </tr>
                <tr><td style="height:8px;"></td></tr>
                <tr>
                  <td style="padding:12px 16px; background:#f0f4ff; border-radius:8px;">
                    <span style="color:#1a56a0; font-weight:700;">3.</span> <strong>Send your first quote</strong> — build a quote, hit Send Quote, and your client gets a beautiful interactive quote they can approve online.
                  </td>
                </tr>
              </table>

              <div style="margin:32px 0; text-align:center;">
                <a href="https://quotedr.io/quote-builder.html" 
                   style="display:inline-block; background:#1a56a0; color:white; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:600; font-size:15px;">
                  Build Your First Quote →
                </a>
              </div>

              <p style="margin:0; color:#666; font-size:14px; line-height:1.6;">
                If you run into anything or have questions, just reply to this email — I'm happy to help!
              </p>
              <p style="margin:16px 0 0; color:#444; font-size:14px;">
                — Adam<br>
                <span style="color:#888;">ALD Direct Inc. / QuoteDr</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px; background:#f8f9fa; border-top:1px solid #eee; text-align:center;">
              <p style="margin:0; color:#999; font-size:12px;">
                QuoteDr · <a href="https://quotedr.io" style="color:#999;">quotedr.io</a><br>
                <a href="https://quotedr.io/privacy.html" style="color:#999;">Privacy Policy</a> · 
                <a href="https://quotedr.io/terms.html" style="color:#999;">Terms of Service</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'QuoteDr <welcome@quotedr.io>',
        to: [email],
        subject: 'Welcome to QuoteDr! 🎉',
        html: htmlBody
      })
    });

    const result = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: result.message || 'Failed to send email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
