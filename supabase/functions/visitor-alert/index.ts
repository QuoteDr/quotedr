import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://axmoffknvblluibuitrq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const WEBHOOK_SECRET = Deno.env.get('POSTHOG_VISITOR_WEBHOOK_SECRET') ?? '';
const ALERT_EMAIL = Deno.env.get('VISITOR_ALERT_EMAIL') ?? 'info@alddirect.ca';
const POSTHOG_PROJECT_ID = Deno.env.get('POSTHOG_PROJECT_ID') ?? '411455';
const VISITOR_LABEL_SALT = Deno.env.get('VISITOR_LABEL_SALT') ?? POSTHOG_PROJECT_ID;
const ALLOWED_EVENTS = new Set([
  'pricing_opened',
  'signup_gate_opened',
  'newsletter_signup_completed',
  'contact_opened',
]);
const EVENT_LABELS: Record<string, string> = {
  pricing_opened: 'Pricing opened',
  signup_gate_opened: 'Early Access opened',
  newsletter_signup_completed: 'Newsletter signup completed',
  contact_opened: 'Contact opened',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function safeText(value: unknown, fallback = '', maxLength = 160) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return mismatch === 0;
}

function requestSecret(req: Request) {
  const headerSecret = req.headers.get('x-quotedr-webhook-secret') || '';
  if (headerSecret) return headerSecret;
  const authorization = req.headers.get('authorization') || '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7) : '';
}

function safeRoute(value: unknown) {
  let path = safeText(value, '/unknown', 240).split('?')[0].split('#')[0].replace(/\\/g, '/');
  if (!path.startsWith('/')) path = '/' + path;
  const segments = path.split('/').filter(Boolean).map((segment) => {
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ':id';
    if (/^\d{8,}$/.test(segment)) return ':id';
    if (/^[A-Za-z0-9_-]{24,}$/.test(segment)) return ':id';
    return segment.replace(/[^A-Za-z0-9._~-]/g, '-').slice(0, 64);
  });
  path = '/' + segments.join('/');
  path = path.replace(/\.html$/i, '');
  return (path || '/unknown').slice(0, 160);
}

function safeDomain(value: unknown) {
  const raw = safeText(value, 'direct', 240);
  if (raw === 'direct') return raw;
  try {
    const parsed = new URL(raw.indexOf('://') === -1 ? 'https://' + raw : raw);
    return safeText(parsed.hostname.toLowerCase().replace(/^www\./, ''), 'direct', 160);
  } catch (_) {
    return safeText(raw.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, ''), 'direct', 160);
  }
}

function safeTimestamp(value: unknown) {
  const date = new Date(String(value || ''));
  const now = Date.now();
  if (Number.isNaN(date.getTime()) || Math.abs(date.getTime() - now) > 366 * 86400000) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(VISITOR_LABEL_SALT + ':' + value);
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

type NormalizedAlert = {
  providerEventId: string;
  sessionFingerprint: string;
  visitorLabel: string;
  event: string;
  label: string;
  route: string;
  city: string;
  region: string;
  country: string;
  location: string;
  referrerDomain: string;
  device: string;
  occurredAt: string;
};

async function normalizePayload(bodyValue: unknown): Promise<NormalizedAlert | null> {
  const body = asRecord(bodyValue);
  const eventEnvelope = asRecord(body.event);
  const dataEnvelope = asRecord(body.data);
  const dataEventEnvelope = asRecord(dataEnvelope.event);
  const payloadEnvelope = asRecord(body.payload);
  const properties = asRecord(
    body.properties ||
    eventEnvelope.properties ||
    dataEnvelope.properties ||
    dataEventEnvelope.properties ||
    payloadEnvelope.properties
  );

  const event = safeText(
    typeof body.event === 'string'
      ? body.event
      : eventEnvelope.event ||
        (typeof dataEnvelope.event === 'string' ? dataEnvelope.event : dataEnvelope.event_name) ||
        dataEventEnvelope.event ||
        (typeof payloadEnvelope.event === 'string' ? payloadEnvelope.event : payloadEnvelope.event_name) ||
        body.event_name ||
        body.name
  );
  if (!ALLOWED_EVENTS.has(event)) return null;
  if (safeText(properties.site_area) !== 'marketing') return null;
  if (safeText(properties.audience) !== 'visitor') return null;

  const sessionKey = safeText(
    properties.$session_id ||
    body.session_id ||
    eventEnvelope.session_id ||
    dataEnvelope.session_id ||
    dataEventEnvelope.session_id ||
    payloadEnvelope.session_id ||
    body.distinct_id ||
    eventEnvelope.distinct_id ||
    dataEnvelope.distinct_id ||
    dataEventEnvelope.distinct_id ||
    payloadEnvelope.distinct_id,
    '',
    300
  );
  const visitorKey = safeText(
    body.distinct_id ||
    eventEnvelope.distinct_id ||
    dataEnvelope.distinct_id ||
    dataEventEnvelope.distinct_id ||
    payloadEnvelope.distinct_id ||
    properties.distinct_id ||
    sessionKey,
    '',
    300
  );
  if (!sessionKey || !visitorKey) return null;

  const route = safeRoute(properties.route || properties.$pathname || '/unknown');
  const occurredAt = safeTimestamp(
    body.timestamp ||
    eventEnvelope.timestamp ||
    dataEnvelope.timestamp ||
    dataEventEnvelope.timestamp ||
    payloadEnvelope.timestamp ||
    properties.timestamp
  );
  const city = safeText(properties.$geoip_city_name || properties.city, '', 120);
  const region = safeText(properties.$geoip_subdivision_1_name || properties.region, '', 120);
  const country = safeText(properties.$geoip_country_name || properties.country, '', 120);
  const location = [city, region, country].filter(Boolean).join(', ') || 'Location unavailable';
  const browser = safeText(properties.$browser || properties.browser, '', 60);
  const deviceType = safeText(properties.$device_type || properties.device, 'Unknown', 60);
  const device = safeText(browser ? deviceType + ' / ' + browser : deviceType, 'Unknown', 120);
  const referrerDomain = safeDomain(properties.referrer_domain || properties.$referring_domain || 'direct');
  const providerCandidate = safeText(
    body.uuid ||
    body.id ||
    eventEnvelope.uuid ||
    eventEnvelope.id ||
    dataEnvelope.uuid ||
    dataEnvelope.id ||
    dataEventEnvelope.uuid ||
    payloadEnvelope.uuid ||
    payloadEnvelope.id,
    '',
    240
  );
  const providerEventId = await digest(
    'event:' + (providerCandidate || event + '|' + sessionKey + '|' + occurredAt + '|' + route)
  );
  const visitorDigest = await digest(visitorKey);

  return {
    providerEventId,
    sessionFingerprint: await digest('session:' + sessionKey),
    visitorLabel: 'Visitor ' + visitorDigest.slice(0, 4).toUpperCase(),
    event,
    label: EVENT_LABELS[event] || event,
    route,
    city,
    region,
    country,
    location,
    referrerDomain,
    device,
    occurredAt,
  };
}

function alertEmailHtml(alert: NormalizedAlert) {
  return '<div>' +
    '<h2>QuoteDr visitor alert</h2>' +
    '<p><strong>' + escapeHtml(alert.label) + '</strong></p>' +
    '<p>' + escapeHtml(alert.visitorLabel) + ' showed high-intent activity on ' +
      escapeHtml(alert.route) + '.</p>' +
    '<ul>' +
      '<li>Approximate location: ' + escapeHtml(alert.location) + '</li>' +
      '<li>Device: ' + escapeHtml(alert.device) + '</li>' +
      '<li>Referral: ' + escapeHtml(alert.referrerDomain) + '</li>' +
      '<li>Time: ' + escapeHtml(new Date(alert.occurredAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' })) + ' ET</li>' +
    '</ul>' +
    '<p>This alert never includes an IP address, exact coordinates, client data, quote contents, material details, or pricing.</p>' +
    '<p><a href=\'https://quotedr.io/settings.html?tab=site-traffic\'>Open Site Traffic</a></p>' +
  '</div>';
}

function alertEmailText(alert: NormalizedAlert) {
  return [
    'QuoteDr visitor alert',
    alert.label,
    alert.visitorLabel + ' showed high-intent activity on ' + alert.route + '.',
    'Approximate location: ' + alert.location,
    'Device: ' + alert.device,
    'Referral: ' + alert.referrerDomain,
    'Time: ' + alert.occurredAt,
    '',
    'Open Site Traffic: https://quotedr.io/settings.html?tab=site-traffic',
    'This alert does not include raw IP addresses, exact coordinates, client data, quote contents, material details, or pricing.',
  ].join('\n');
}

async function sendAlertEmail(alert: NormalizedAlert) {
  if (!RESEND_API_KEY) throw new Error('Resend API key is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'QuoteDr Alerts <welcome@quotedr.io>',
      to: [ALERT_EMAIL],
      subject: '[QuoteDr] ' + alert.label + ' - ' + alert.visitorLabel,
      html: alertEmailHtml(alert),
      text: alertEmailText(alert),
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error('Visitor alert email failed (' + response.status + '): ' + responseText.slice(0, 200));
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!WEBHOOK_SECRET) return jsonResponse({ error: 'Webhook secret is not configured' }, 500);
  if (!constantTimeEqual(requestSecret(req), WEBHOOK_SECRET)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Supabase service role is not configured' }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const alert = await normalizePayload(body);
    if (!alert) return jsonResponse({ received: true, recorded: false, reason: 'Event not eligible' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc('record_visitor_alert', {
      p_provider_event_id: alert.providerEventId,
      p_session_fingerprint: alert.sessionFingerprint,
      p_visitor_label: alert.visitorLabel,
      p_intent: alert.event,
      p_route: alert.route,
      p_city: alert.city,
      p_region: alert.region,
      p_country: alert.country,
      p_referrer_domain: alert.referrerDomain,
      p_device: alert.device,
      p_event_at: alert.occurredAt,
    });
    if (error) throw new Error('Could not record visitor alert: ' + error.message);

    const reservation = Array.isArray(data) ? data[0] : data;
    const alertId = safeText(reservation?.alert_id, '', 80);
    const shouldEmail = !!reservation?.should_email;
    let emailed = false;

    if (shouldEmail && alertId) {
      try {
        await sendAlertEmail(alert);
        const { error: updateError } = await supabase
          .from('visitor_alerts')
          .update({ emailed_at: new Date().toISOString(), email_reserved_at: null })
          .eq('id', alertId);
        if (updateError) throw new Error(updateError.message);
        emailed = true;
      } catch (emailError) {
        await supabase
          .from('visitor_alerts')
          .update({ email_reserved_at: null })
          .eq('id', alertId);
        throw emailError;
      }
    }

    return jsonResponse({
      received: true,
      recorded: true,
      emailed,
      deduplicated: !shouldEmail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Visitor alert failed';
    return jsonResponse({ error: message }, 500);
  }
});
