import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const QUOTEDR_ADMIN_EMAILS = new Set([
  'admin@quotedr.io',
  'info@alddirect.ca',
  'ald.direct.contracting@gmail.com',
  ...(Deno.env.get('QUOTEDR_ADMIN_EMAILS') ?? '').split(','),
].map((email) => email.trim().toLowerCase()).filter(Boolean));

const TOPIC_KEYS = new Set([
  'ai_voice_to_quote', 'choice_groups', 'invoices_payments', 'quotes_approvals',
  'quote_builder', 'saved_items_pricing', 'client_portal', 'clients_contacts',
  'dashboard_sync', 'templates', 'ai_quote_copilot', 'smart_import',
  'floor_plan_scanner', 'quickbooks', 'job_tracking_expenses', 'change_orders',
  'photos_media', 'notifications_followups', 'account_plan', 'assistant_help',
  'support_feedback',
]);
const INTENT_KEYS = new Set(['problem', 'feature_request', 'how_to', 'clarification', 'other']);
const SURFACE_KEYS = new Set(['quote_builder', 'dashboard', 'settings', 'help', 'other']);
const FORBIDDEN_RAW_FIELDS = new Set([
  'question', 'answer', 'message', 'messages', 'prompt', 'chat', 'conversation',
  'email', 'client', 'clientName', 'clientEmail', 'userId',
]);

type JsonMap = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;

function jsonResponse(body: JsonMap, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeKey(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function finiteInteger(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function requireConfiguration() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Chatbot feedback is not configured');
  }
}

function adminClient() {
  requireConfiguration();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyUser(req: Request) {
  requireConfiguration();
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) throw new Error('Missing authorization');
  const token = authHeader.slice(7).trim();
  const verifier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data?.user) throw new Error('Invalid authorization');
  return data.user;
}

async function verifyAdmin(req: Request) {
  const user = await verifyUser(req);
  const email = String(user.email || '').trim().toLowerCase();
  if (!QUOTEDR_ADMIN_EMAILS.has(email)) throw new Error('Admin access required');
  return user;
}

function assertNoRawChatFields(body: JsonMap) {
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_RAW_FIELDS.has(key)) {
      throw new Error('Raw chat content is not accepted by this endpoint');
    }
  }
}

async function recordObservation(req: Request, body: JsonMap) {
  assertNoRawChatFields(body);
  const user = await verifyUser(req);
  const topicKey = safeKey(body.topicKey);
  const intentKey = safeKey(body.intentKey);
  const surfaceKey = safeKey(body.surfaceKey);
  if (!TOPIC_KEYS.has(topicKey) || !INTENT_KEYS.has(intentKey) || !SURFACE_KEYS.has(surfaceKey)) {
    return jsonResponse({ error: 'Invalid privacy-safe feedback classification' }, 400);
  }

  const { data, error } = await adminClient().rpc('record_chatbot_feedback_observation', {
    p_user_id: user.id,
    p_topic_key: topicKey,
    p_intent_key: intentKey,
    p_surface_key: surfaceKey,
  });
  if (error) throw new Error('Could not record chatbot feedback');
  const result = Array.isArray(data) ? data[0] : data;
  return jsonResponse({ success: true, recorded: result?.recorded === true });
}

async function loadAllObservations(client: SupabaseClient, sinceIso: string) {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await client
      .from('chatbot_feedback_observations')
      .select('topic_key,user_fingerprint,intent_key,surface_key,question_count,first_seen_at,last_seen_at')
      .gte('last_seen_at', sinceIso)
      .order('last_seen_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function summarizeThemes(settings: any, themes: any[], observations: any[], now = new Date()) {
  const windowStart = new Date(now.getTime() - Number(settings.window_days || 14) * 86400000);
  return themes.map((theme) => {
    const themeRows = observations.filter((row) => row.topic_key === theme.topic_key);
    const windowRows = themeRows.filter((row) => new Date(row.last_seen_at) >= windowStart);
    const distinctUsers = new Set(windowRows.map((row) => row.user_fingerprint)).size;
    const questionCount = windowRows.reduce((sum, row) => sum + Number(row.question_count || 0), 0);
    const examples = new Map<string, { intentKey: string; surfaceKey: string; users: Set<string>; questions: number }>();
    windowRows.forEach((row) => {
      const key = row.intent_key + ':' + row.surface_key;
      const existing = examples.get(key) || {
        intentKey: row.intent_key,
        surfaceKey: row.surface_key,
        users: new Set<string>(),
        questions: 0,
      };
      existing.users.add(row.user_fingerprint);
      existing.questions += Number(row.question_count || 0);
      examples.set(key, existing);
    });

    const alertedAt = theme.alerted_at ? new Date(theme.alerted_at) : null;
    const reviewedAt = theme.reviewed_at ? new Date(theme.reviewed_at) : null;
    const snoozedUntil = theme.snoozed_until ? new Date(theme.snoozed_until) : null;
    const unresolved = !!alertedAt && (!reviewedAt || alertedAt > reviewedAt);
    const snoozed = unresolved && !!snoozedUntil && snoozedUntil > now;
    const needsAttention = unresolved && !snoozed;

    return {
      topicKey: theme.topic_key,
      firstSeenAt: theme.first_seen_at,
      lastSeenAt: theme.last_seen_at,
      totalQuestionCount: Number(theme.total_question_count || 0),
      windowDistinctUsers: distinctUsers,
      windowQuestionCount: questionCount,
      thresholdMet: distinctUsers >= Number(settings.distinct_user_threshold || 3),
      alertedAt: theme.alerted_at,
      reviewedAt: theme.reviewed_at,
      snoozedUntil: theme.snoozed_until,
      state: needsAttention ? 'needs_attention' : snoozed ? 'snoozed' : reviewedAt ? 'reviewed' : 'monitoring',
      safeExamples: Array.from(examples.values())
        .map((item) => ({
          intentKey: item.intentKey,
          surfaceKey: item.surfaceKey,
          distinctUsers: item.users.size,
          questions: item.questions,
        }))
        .sort((a, b) => b.distinctUsers - a.distinctUsers || b.questions - a.questions)
        .slice(0, 4),
    };
  }).sort((a, b) => {
    if (a.state === 'needs_attention' && b.state !== 'needs_attention') return -1;
    if (b.state === 'needs_attention' && a.state !== 'needs_attention') return 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });
}

async function loadAdminOverview(req: Request) {
  await verifyAdmin(req);
  const client = adminClient();
  const [settingsResult, themesResult] = await Promise.all([
    client.from('chatbot_feedback_settings').select('*').eq('singleton', true).single(),
    client.from('chatbot_feedback_themes').select('*').order('last_seen_at', { ascending: false }),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (themesResult.error) throw themesResult.error;
  const settings = settingsResult.data;
  const since = new Date(Date.now() - Number(settings.window_days || 14) * 86400000).toISOString();
  const observations = await loadAllObservations(client, since);
  const themes = summarizeThemes(settings, themesResult.data || [], observations);
  return jsonResponse({
    success: true,
    generatedAt: new Date().toISOString(),
    settings: {
      enabled: settings.enabled === true,
      distinctUserThreshold: Number(settings.distinct_user_threshold || 3),
      windowDays: Number(settings.window_days || 14),
      cooldownDays: Number(settings.cooldown_days || 14),
      retentionDays: Number(settings.retention_days || 90),
    },
    attentionCount: themes.filter((theme) => theme.state === 'needs_attention').length,
    themes,
    privacy: {
      rawChatStored: false,
      directUserIdentifiersStored: false,
      fingerprintsReturned: false,
      fingerprintsAreTopicScoped: true,
    },
  });
}

async function saveSettings(req: Request, body: JsonMap) {
  const user = await verifyAdmin(req);
  const threshold = finiteInteger(body.distinctUserThreshold, 2, 20);
  const windowDays = finiteInteger(body.windowDays, 1, 90);
  const cooldownDays = finiteInteger(body.cooldownDays, 1, 90);
  if (threshold === null || windowDays === null || cooldownDays === null || typeof body.enabled !== 'boolean') {
    return jsonResponse({ error: 'Invalid chatbot feedback settings' }, 400);
  }
  const { error } = await adminClient()
    .from('chatbot_feedback_settings')
    .update({
      enabled: body.enabled,
      distinct_user_threshold: threshold,
      window_days: windowDays,
      cooldown_days: cooldownDays,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('singleton', true);
  if (error) throw error;
  return jsonResponse({ success: true });
}

async function updateTheme(req: Request, body: JsonMap) {
  const user = await verifyAdmin(req);
  const topicKey = safeKey(body.topicKey);
  if (!TOPIC_KEYS.has(topicKey)) return jsonResponse({ error: 'Invalid chatbot feedback topic' }, 400);
  const action = safeKey(body.action);
  const now = new Date();
  let update: Record<string, unknown>;
  if (action === 'review') {
    update = { reviewed_at: now.toISOString(), reviewed_by: user.id, snoozed_until: null, updated_at: now.toISOString() };
  } else if (action === 'reopen') {
    update = { reviewed_at: null, reviewed_by: null, snoozed_until: null, updated_at: now.toISOString() };
  } else if (action === 'snooze') {
    const days = finiteInteger(body.days, 1, 30);
    if (days === null) return jsonResponse({ error: 'Invalid snooze period' }, 400);
    update = { snoozed_until: new Date(now.getTime() + days * 86400000).toISOString(), updated_at: now.toISOString() };
  } else {
    return jsonResponse({ error: 'Unsupported chatbot feedback action' }, 400);
  }
  const { error } = await adminClient().from('chatbot_feedback_themes').update(update).eq('topic_key', topicKey);
  if (error) throw error;
  return jsonResponse({ success: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({})) as JsonMap;
    const action = safeKey(body.action || 'list');
    if (action === 'record') return await recordObservation(req, body);
    if (action === 'list') return await loadAdminOverview(req);
    if (action === 'save_settings') return await saveSettings(req, body);
    if (action === 'review' || action === 'reopen' || action === 'snooze') return await updateTheme(req, body);
    return jsonResponse({ error: 'Unsupported chatbot feedback action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chatbot feedback request failed';
    const status = /missing authorization|invalid authorization/i.test(message)
      ? 401
      : /admin access/i.test(message)
        ? 403
        : /raw chat|invalid|unsupported/i.test(message)
          ? 400
          : /not configured/i.test(message)
            ? 503
            : 500;
    return jsonResponse({ error: message }, status);
  }
});
