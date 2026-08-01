import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://axmoffknvblluibuitrq.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const POSTHOG_PERSONAL_API_KEY = Deno.env.get('POSTHOG_PERSONAL_API_KEY') ?? '';
const POSTHOG_PROJECT_ID = Deno.env.get('POSTHOG_PROJECT_ID') ?? '411455';
const POSTHOG_HOST = (Deno.env.get('POSTHOG_HOST') ?? 'https://us.posthog.com').replace(/\/+$/, '');
const VISITOR_LABEL_SALT = Deno.env.get('VISITOR_LABEL_SALT') ?? POSTHOG_PROJECT_ID;
const QUOTEDR_ADMIN_EMAILS = new Set([
  'info@alddirect.ca',
  'ald.direct.contracting@gmail.com',
]);
const HIGH_INTENT_EVENTS = [
  'pricing_opened',
  'signup_gate_opened',
  'newsletter_signup_completed',
  'contact_opened',
];
const HIGH_INTENT_LABELS: Record<string, string> = {
  pricing_opened: 'Pricing opened',
  signup_gate_opened: 'Early Access opened',
  newsletter_signup_completed: 'Newsletter signup',
  contact_opened: 'Contact opened',
};

type JsonMap = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;

function jsonResponse(body: JsonMap, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clampDays(value: unknown) {
  const requested = Number(value);
  return requested === 1 || requested === 30 ? requested : 7;
}

function clampLiveMinutes(value: unknown) {
  const requested = Number(value);
  if (!Number.isFinite(requested)) return 5;
  return Math.max(1, Math.min(15, Math.round(requested)));
}

function safeText(value: unknown, fallback = '', maxLength = 160) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rowsFrom(result: any): any[][] {
  return Array.isArray(result?.results) ? result.results : [];
}

function toIso(value: unknown) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function regionLabel(city: unknown, region: unknown, country: unknown) {
  const parts = [safeText(city), safeText(region), safeText(country)].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Location unavailable';
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(VISITOR_LABEL_SALT + ':' + value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function visitorLabel(value: string) {
  const digest = await sha256(value || 'unknown');
  return 'Visitor ' + digest.slice(0, 4).toUpperCase();
}

async function verifyAdmin(req: Request): Promise<{ client: SupabaseClient; email: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) throw new Error('Missing authorization');
  if (!SUPABASE_ANON_KEY) throw new Error('Supabase anonymous key is not configured');

  const token = authHeader.slice(7);
  const verifier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data?.user) throw new Error('Invalid authorization');

  const email = String(data.user.email || '').trim().toLowerCase();
  if (!QUOTEDR_ADMIN_EMAILS.has(email)) throw new Error('Admin access required');

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, email };
}

async function posthogQuery(query: string, name: string) {
  if (!POSTHOG_PERSONAL_API_KEY) throw new Error('PostHog API key is not configured');
  const response = await fetch(POSTHOG_HOST + '/api/projects/' + POSTHOG_PROJECT_ID + '/query/', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + POSTHOG_PERSONAL_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: { kind: 'HogQLQuery', query },
      name,
    }),
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || 'PostHog query failed (' + response.status + ')');
  }
  return data;
}

type SessionSummary = {
  visitorLabel: string;
  firstSeen: string;
  lastSeen: string;
  route: string;
  landingRoute: string;
  pageViews: number;
  location: string;
  city: string;
  region: string;
  country: string;
  device: string;
  browser: string;
  referrerDomain: string;
};

async function summarizeSessions(rows: any[][]) {
  const rawSessions = new Map<string, {
    visitorKey: string;
    firstSeen: string;
    lastSeen: string;
    route: string;
    landingRoute: string;
    pageViews: number;
    city: string;
    region: string;
    country: string;
    device: string;
    browser: string;
    referrerDomain: string;
  }>();

  rows.forEach((row) => {
    const sessionKey = safeText(row[0], 'unknown', 240);
    const visitorKey = safeText(row[1], sessionKey, 240);
    const timestamp = toIso(row[2]);
    const route = safeText(row[3], '/unknown');
    const current = rawSessions.get(sessionKey);
    if (!current) {
      rawSessions.set(sessionKey, {
        visitorKey,
        firstSeen: timestamp,
        lastSeen: timestamp,
        route,
        landingRoute: route,
        pageViews: 1,
        city: safeText(row[4]),
        region: safeText(row[5]),
        country: safeText(row[6]),
        device: safeText(row[7], 'Unknown'),
        browser: safeText(row[8]),
        referrerDomain: safeText(row[9], 'direct'),
      });
      return;
    }

    current.pageViews += 1;
    if (timestamp > current.lastSeen) {
      current.lastSeen = timestamp;
      current.route = route;
    }
    if (timestamp < current.firstSeen) {
      current.firstSeen = timestamp;
      current.landingRoute = route;
    }
  });

  const summaries: SessionSummary[] = [];
  for (const session of rawSessions.values()) {
    summaries.push({
      visitorLabel: await visitorLabel(session.visitorKey),
      firstSeen: session.firstSeen,
      lastSeen: session.lastSeen,
      route: session.route,
      landingRoute: session.landingRoute,
      pageViews: session.pageViews,
      location: regionLabel(session.city, session.region, session.country),
      city: session.city,
      region: session.region,
      country: session.country,
      device: session.device,
      browser: session.browser,
      referrerDomain: session.referrerDomain,
    });
  }

  return summaries.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

async function summarizeHighIntent(rows: any[][]) {
  const items = [];
  for (const row of rows) {
    const event = safeText(row[0]);
    items.push({
      visitorLabel: await visitorLabel(safeText(row[2], safeText(row[1], 'unknown', 240), 240)),
      event,
      label: HIGH_INTENT_LABELS[event] || event,
      occurredAt: toIso(row[3]),
      route: safeText(row[4], '/unknown'),
      location: regionLabel(row[5], row[6], row[7]),
      device: safeText(row[8], 'Unknown'),
      referrerDomain: safeText(row[9], 'direct'),
    });
  }
  return items;
}

function topPagesFrom(rows: any[][]) {
  return rows.map((row) => ({
    route: safeText(row[0], '/unknown'),
    pageViews: numberValue(row[1]),
    uniqueVisitors: numberValue(row[2]),
  }));
}

function regionsFrom(rows: any[][]) {
  return rows.map((row) => ({
    label: regionLabel(row[2], row[1], row[0]),
    visitors: numberValue(row[3]),
  }));
}

function devicesFrom(rows: any[][]) {
  return rows.map((row) => {
    const device = safeText(row[0], 'Unknown');
    const browser = safeText(row[1]);
    return {
      label: browser ? device + ' / ' + browser : device,
      visitors: numberValue(row[2]),
    };
  });
}

function referrersFrom(rows: any[][]) {
  return rows.map((row) => ({
    domain: safeText(row[0], 'direct'),
    visitors: numberValue(row[1]),
  }));
}

async function loadAlertFeed(client: SupabaseClient, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await client
    .from('visitor_alerts')
    .select('visitor_label,intent,route,city,region,country,referrer_domain,device,event_at,emailed_at')
    .gte('event_at', since)
    .order('event_at', { ascending: false })
    .limit(50);

  if (error) {
    return {
      alerts: [],
      alertFeedReady: false,
      alertFeedMessage: 'The visitor alert migration or webhook is not active yet.',
    };
  }

  return {
    alerts: (data || []).map((row: any) => ({
      visitorLabel: safeText(row.visitor_label, 'Visitor'),
      event: safeText(row.intent),
      label: HIGH_INTENT_LABELS[safeText(row.intent)] || safeText(row.intent),
      route: safeText(row.route, '/unknown'),
      location: regionLabel(row.city, row.region, row.country),
      referrerDomain: safeText(row.referrer_domain, 'direct'),
      device: safeText(row.device, 'Unknown'),
      occurredAt: toIso(row.event_at),
      emailed: !!row.emailed_at,
    })),
    alertFeedReady: true,
    alertFeedMessage: '',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { client } = await verifyAdmin(req);
    const body = await req.json().catch(() => ({}));
    const days = clampDays(body.days);
    const liveMinutes = clampLiveMinutes(body.liveMinutes);
    const quote = String.fromCharCode(39);
    const intentList = HIGH_INTENT_EVENTS.map((event) => quote + event + quote).join(', ');
    const marketingFilter =
      'timestamp >= now() - interval ' + days + ' day ' +
      'and properties.site_area = \'marketing\' ' +
      'and properties.audience = \'visitor\' ';

    const overviewQuery =
      'select count() as page_views, count(distinct distinct_id) as unique_visitors, ' +
      'count(distinct coalesce(nullIf(toString(properties.$session_id), \'\'), distinct_id)) as sessions ' +
      'from events where ' + marketingFilter + 'and event = \'page_viewed\'';

    const sessionsQuery =
      'select ' +
      'coalesce(nullIf(toString(properties.$session_id), \'\'), distinct_id) as session_key, ' +
      'distinct_id, timestamp, ' +
      'coalesce(nullIf(toString(properties.route), \'\'), \'/unknown\') as route, ' +
      'coalesce(toString(properties.$geoip_city_name), \'\') as city, ' +
      'coalesce(toString(properties.$geoip_subdivision_1_name), \'\') as region, ' +
      'coalesce(toString(properties.$geoip_country_name), \'\') as country, ' +
      'coalesce(nullIf(toString(properties.$device_type), \'\'), \'Unknown\') as device, ' +
      'coalesce(toString(properties.$browser), \'\') as browser, ' +
      'coalesce(nullIf(toString(properties.referrer_domain), \'\'), nullIf(toString(properties.$referring_domain), \'\'), \'direct\') as referrer_domain ' +
      'from events where ' + marketingFilter + 'and event = \'page_viewed\' ' +
      'order by timestamp desc limit 1000';

    const highIntentQuery =
      'select event, ' +
      'coalesce(nullIf(toString(properties.$session_id), \'\'), distinct_id) as session_key, ' +
      'distinct_id, timestamp, ' +
      'coalesce(nullIf(toString(properties.route), \'\'), \'/unknown\') as route, ' +
      'coalesce(toString(properties.$geoip_city_name), \'\') as city, ' +
      'coalesce(toString(properties.$geoip_subdivision_1_name), \'\') as region, ' +
      'coalesce(toString(properties.$geoip_country_name), \'\') as country, ' +
      'coalesce(nullIf(toString(properties.$device_type), \'\'), \'Unknown\') as device, ' +
      'coalesce(nullIf(toString(properties.referrer_domain), \'\'), nullIf(toString(properties.$referring_domain), \'\'), \'direct\') as referrer_domain ' +
      'from events where ' + marketingFilter + 'and event in (' + intentList + ') ' +
      'order by timestamp desc limit 200';

    const highIntentOverviewQuery =
      'select count() as events, count(distinct distinct_id) as visitors ' +
      'from events where ' + marketingFilter + 'and event in (' + intentList + ')';

    const topPagesQuery =
      'select coalesce(nullIf(toString(properties.route), \'\'), \'/unknown\') as route, ' +
      'count() as page_views, count(distinct distinct_id) as unique_visitors ' +
      'from events where ' + marketingFilter + 'and event = \'page_viewed\' ' +
      'group by route order by page_views desc limit 12';

    const regionsQuery =
      'select coalesce(toString(properties.$geoip_country_name), \'\') as country, ' +
      'coalesce(toString(properties.$geoip_subdivision_1_name), \'\') as region, ' +
      'coalesce(toString(properties.$geoip_city_name), \'\') as city, ' +
      'count(distinct distinct_id) as visitors ' +
      'from events where ' + marketingFilter + 'and event = \'page_viewed\' ' +
      'group by country, region, city order by visitors desc limit 12';

    const devicesQuery =
      'select coalesce(nullIf(toString(properties.$device_type), \'\'), \'Unknown\') as device, ' +
      'coalesce(toString(properties.$browser), \'\') as browser, ' +
      'count(distinct distinct_id) as visitors ' +
      'from events where ' + marketingFilter + 'and event = \'page_viewed\' ' +
      'group by device, browser order by visitors desc limit 12';

    const referrersQuery =
      'select coalesce(nullIf(toString(properties.referrer_domain), \'\'), nullIf(toString(properties.$referring_domain), \'\'), \'direct\') as domain, ' +
      'count(distinct distinct_id) as visitors ' +
      'from events where ' + marketingFilter + 'and event = \'page_viewed\' ' +
      'group by domain order by visitors desc limit 12';

    const [
      overviewResult,
      sessionsResult,
      highIntentResult,
      highIntentOverviewResult,
      topPagesResult,
      regionsResult,
      devicesResult,
      referrersResult,
      alertFeed,
    ] = await Promise.all([
      posthogQuery(overviewQuery, 'QuoteDr marketing overview ' + days + 'd'),
      posthogQuery(sessionsQuery, 'QuoteDr recent marketing sessions ' + days + 'd'),
      posthogQuery(highIntentQuery, 'QuoteDr high intent activity ' + days + 'd'),
      posthogQuery(highIntentOverviewQuery, 'QuoteDr high intent summary ' + days + 'd'),
      posthogQuery(topPagesQuery, 'QuoteDr marketing top pages ' + days + 'd'),
      posthogQuery(regionsQuery, 'QuoteDr marketing regions ' + days + 'd'),
      posthogQuery(devicesQuery, 'QuoteDr marketing devices ' + days + 'd'),
      posthogQuery(referrersQuery, 'QuoteDr marketing referrers ' + days + 'd'),
      loadAlertFeed(client, days),
    ]);

    const overview = rowsFrom(overviewResult)[0] || [];
    const highOverview = rowsFrom(highIntentOverviewResult)[0] || [];
    const sessions = await summarizeSessions(rowsFrom(sessionsResult));
    const activeCutoff = Date.now() - liveMinutes * 60000;
    const activeByVisitor = new Map<string, SessionSummary>();
    sessions.forEach((session) => {
      if (new Date(session.lastSeen).getTime() < activeCutoff) return;
      const existing = activeByVisitor.get(session.visitorLabel);
      if (!existing || session.lastSeen > existing.lastSeen) {
        activeByVisitor.set(session.visitorLabel, session);
      }
    });

    return jsonResponse({
      success: true,
      generatedAt: new Date().toISOString(),
      days,
      liveMinutes,
      summary: {
        activeVisitors: activeByVisitor.size,
        uniqueVisitors: numberValue(overview[1]),
        pageViews: numberValue(overview[0]),
        sessions: numberValue(overview[2]),
        highIntentVisits: numberValue(highOverview[0]),
        highIntentVisitors: numberValue(highOverview[1]),
      },
      activeVisitors: Array.from(activeByVisitor.values()).slice(0, 30),
      recentSessions: sessions.slice(0, 40),
      highIntent: await summarizeHighIntent(rowsFrom(highIntentResult)),
      topPages: topPagesFrom(rowsFrom(topPagesResult)),
      regions: regionsFrom(rowsFrom(regionsResult)),
      devices: devicesFrom(rowsFrom(devicesResult)),
      referrers: referrersFrom(rowsFrom(referrersResult)),
      alerts: alertFeed.alerts,
      alertFeedReady: alertFeed.alertFeedReady,
      alertFeedMessage: alertFeed.alertFeedMessage,
      posthogUrl: POSTHOG_HOST + '/project/' + POSTHOG_PROJECT_ID + '/web',
      privacy: {
        visitorLabelsAreHashed: true,
        rawIpReturned: false,
        exactCoordinatesReturned: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = /missing authorization|invalid authorization/i.test(message)
      ? 401
      : /admin access/i.test(message)
        ? 403
        : 500;
    return jsonResponse({ error: message }, status);
  }
});
