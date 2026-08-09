import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  VOICE_TRANSCRIPT_NOTICE_VERSION,
  isVoiceTranscriptNoticeAccepted,
  VOICE_TRANSCRIPT_SUPPORT_PAGE_SIZE,
  normalizeVoiceQuoteId,
  normalizeVoiceQuoteNumber,
  normalizeVoiceTranscript,
  normalizeVoiceTranscriptAuditPasses,
  normalizeVoiceTranscriptAuditStatus,
  normalizeVoiceTranscriptStatus,
  normalizeVoiceTranscriptSupportOffset,
  normalizeVoiceTranscriptSupportRequest,
} from '../_shared/voice-transcript-policy.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_EMAILS = new Set([
  'admin@quotedr.io',
  'info@alddirect.ca',
  'ald.direct.contracting@gmail.com',
  ...(Deno.env.get('QUOTEDR_ADMIN_EMAILS') ?? '').split(','),
].map((email) => email.trim().toLowerCase()).filter(Boolean));
const MAX_BODY_BYTES = 32 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Voice transcript service is not configured');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticatedUser(req: Request) {
  const header = req.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(header.slice(7).trim());
  if (error || !data?.user) return null;
  return data.user;
}

function isAdminEmail(value: unknown) {
  return ADMIN_EMAILS.has(String(value ?? '').trim().toLowerCase());
}

async function ownedQuoteId(service: any, userId: string, candidate: unknown) {
  const quoteId = normalizeVoiceQuoteId(candidate);
  if (!quoteId) return null;
  const { data, error } = await service
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'Request is too large' }, 413);

  try {
    const user = await authenticatedUser(req);
    if (!user) return json({ error: 'Authentication required' }, 401);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'Request is too large' }, 413);
    }
    let body: Record<string, any> = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch (_) {
      return json({ error: 'Request body must be valid JSON' }, 400);
    }
    const action = String(body.action || '').trim().toLowerCase();
    const service = serviceClient();

    if (action === 'capture') {
      const transcript = normalizeVoiceTranscript(body.transcript);
      const { data: preference, error: preferenceError } = await service
        .from('ai_voice_transcript_preferences')
        .select('notice_version')
        .eq('user_id', user.id)
        .maybeSingle();
      if (preferenceError) throw preferenceError;
      if (!isVoiceTranscriptNoticeAccepted(preference?.notice_version)) {
        return json({ error: 'Please acknowledge the current transcript storage notice first' }, 409);
      }
      const quoteId = await ownedQuoteId(service, user.id, body.quoteId);
      const row = {
        user_id: user.id,
        account_email: String(user.email || '').trim().toLowerCase(),
        transcript,
        source: 'web_speech_recognition',
        notice_version: preference.notice_version,
        status: 'parsing',
        parser_audit_status: 'pending',
        parser_audit_passes: 0,
        quote_id: quoteId,
        quote_number: normalizeVoiceQuoteNumber(body.quoteNumber),
      };
      const { data, error } = await service
        .from('ai_voice_transcripts')
        .insert(row)
        .select('id,status,created_at')
        .single();
      if (error) throw error;
      return json({ success: true, transcript: data });
    }

    if (action === 'update') {
      const id = normalizeVoiceQuoteId(body.id);
      if (!id) return json({ error: 'Transcript id is required' }, 400);
      const status = normalizeVoiceTranscriptStatus(body.status);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status,
        parser_audit_status: normalizeVoiceTranscriptAuditStatus(body.auditStatus),
        parser_audit_passes: normalizeVoiceTranscriptAuditPasses(body.auditPasses),
        updated_at: now,
      };
      if (status === 'added_to_quote') patch.added_to_quote_at = now;
      const quoteId = await ownedQuoteId(service, user.id, body.quoteId);
      if (quoteId) patch.quote_id = quoteId;
      if (body.quoteNumber !== undefined) patch.quote_number = normalizeVoiceQuoteNumber(body.quoteNumber);
      const { data, error } = await service
        .from('ai_voice_transcripts')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id,status,updated_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: 'Transcript not found' }, 404);
      return json({ success: true, transcript: data });
    }

    if (action === 'support_search') {
      if (!isAdminEmail(user.email)) return json({ error: 'Administrator access required' }, 403);
      const request = normalizeVoiceTranscriptSupportRequest(body.accountEmail, body.caseReference);
      const offset = normalizeVoiceTranscriptSupportOffset(body.offset);
      const { data: accessAudit, error: auditStartError } = await service
        .from('ai_voice_transcript_support_access')
        .insert({
          admin_user_id: user.id,
          admin_email: String(user.email || '').trim().toLowerCase(),
          target_email: request.accountEmail,
          case_reference: request.caseReference,
          result_offset: offset,
        })
        .select('id')
        .single();
      if (auditStartError || !accessAudit?.id) {
        throw auditStartError || new Error('Support access audit could not be started');
      }
      const { data: rows, error, count } = await service
        .from('ai_voice_transcripts')
        .select('id,user_id,transcript,status,parser_audit_status,parser_audit_passes,quote_number,created_at,updated_at,added_to_quote_at', { count: 'exact' })
        .eq('account_email', request.accountEmail)
        .order('created_at', { ascending: false })
        .range(offset, offset + VOICE_TRANSCRIPT_SUPPORT_PAGE_SIZE - 1);
      if (error) throw error;
      const transcripts = rows || [];
      const transcriptIds = transcripts.map((row: any) => row.id);
      const targetUserIds = [...new Set(transcripts.map((row: any) => row.user_id).filter(Boolean))];
      const { data: completedAudit, error: auditError } = await service
        .from('ai_voice_transcript_support_access')
        .update({
          target_user_ids: targetUserIds,
          transcript_ids: transcriptIds,
          result_count: transcripts.length,
          completed_at: new Date().toISOString(),
        })
        .eq('id', accessAudit.id)
        .select('id')
        .maybeSingle();
      if (auditError || !completedAudit) {
        throw auditError || new Error('Support access audit could not be completed');
      }
      const nextOffset = offset + transcripts.length;
      const customerSafeTranscripts = transcripts.map(({ user_id: _userId, ...row }: any) => row);
      return json({
        success: true,
        transcripts: customerSafeTranscripts,
        nextOffset,
        hasMore: nextOffset < Number(count || 0),
      });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice transcript request failed';
    const isClientError = /required|unsupported|valid|exceeds|acknowledge|enter a support/i.test(message);
    return json({ error: isClientError ? message : 'Voice transcript request failed' }, isClientError ? 400 : 500);
  }
});
