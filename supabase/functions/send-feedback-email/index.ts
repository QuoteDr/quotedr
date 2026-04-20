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
    const { type, description, page, severity, user_email, created_at } = await req.json();
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const isFeature = type === 'feature';
    const subject = isFeature ? '💡 Feature Request — QuoteDr' : `🐛 Bug Report [${severity || 'unknown'}] — QuoteDr`;
    const color = isFeature ? '#28a745' : '#dc3545';
    const icon = isFeature ? '💡' : '🐛';

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
  <h2 style="color:${color};">${icon} ${isFeature ? 'Feature Request' : 'Bug Report'}</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:8px;background:#f8f9fa;font-weight:bold;width:140px;">Type</td><td style="padding:8px;">${type}</td></tr>
    <tr><td style="padding:8px;background:#f8f9fa;font-weight:bold;">Page / Area</td><td style="padding:8px;">${page || 'Not specified'}</td></tr>
    ${severity ? `<tr><td style="padding:8px;background:#f8f9fa;font-weight:bold;">Severity</td><td style="padding:8px;">${severity}</td></tr>` : ''}
    <tr><td style="padding:8px;background:#f8f9fa;font-weight:bold;">User</td><td style="padding:8px;">${user_email || 'Not logged in'}</td></tr>
    <tr><td style="padding:8px;background:#f8f9fa;font-weight:bold;">Submitted</td><td style="padding:8px;">${created_at || new Date().toISOString()}</td></tr>
  </table>
  <h3>Description</h3>
  <div style="background:#f8f9fa;padding:16px;border-radius:8px;white-space:pre-wrap;font-size:15px;">${description}</div>
</div>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'QuoteDr Feedback <quotes@quotedr.io>',
        to: ['support@quotedr.io'],
        subject,
        html,
      }),
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
