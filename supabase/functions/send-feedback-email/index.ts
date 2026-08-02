import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAIL = (Deno.env.get('QUOTEDR_ADMIN_EMAIL') || 'admin@quotedr.io').trim();

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const rawDescription = String(body.description || '').trim().slice(0, 12000);
    const rawUserEmail = String(body.user_email || '').trim().toLowerCase().slice(0, 320);
    if (!rawDescription) {
      return new Response(JSON.stringify({ error: 'Description is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const type = body.type === 'feature' ? 'feature' : 'bug';
    const description = escapeHtml(rawDescription);
    const page = escapeHtml(String(body.page || 'Not specified').slice(0, 500));
    const severity = escapeHtml(String(body.severity || '').slice(0, 80));
    const user_email = escapeHtml(rawUserEmail);
    const created_at = escapeHtml(String(body.created_at || new Date().toISOString()).slice(0, 80));
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

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'QuoteDr Feedback <quotes@quotedr.io>',
        to: [ADMIN_EMAIL],
        reply_to: isValidEmail(rawUserEmail) ? rawUserEmail : undefined,
        subject,
        html,
      }),
    });
    if (!response.ok) {
      const details = await response.text();
      console.error('Feedback email delivery failed', response.status, details);
      return new Response(JSON.stringify({ error: 'Could not deliver feedback right now' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
