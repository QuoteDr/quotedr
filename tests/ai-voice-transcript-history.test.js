const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

(async function run() {
  const policy = await import('../supabase/functions/_shared/voice-transcript-policy.mjs');
  assert.strictEqual(policy.VOICE_TRANSCRIPT_NOTICE_VERSION, '2026-08-09-audio-v1');
  assert.strictEqual(policy.isVoiceTranscriptNoticeAccepted('2026-08-07'), true, 'cached text-only clients should keep working during the coordinated rollout');
  assert.strictEqual(policy.isVoiceTranscriptNoticeAccepted('2026-08-09-audio-v1'), true);
  assert.strictEqual(policy.isVoiceTranscriptNoticeAccepted('2026-01-01'), false);
  assert.strictEqual(policy.normalizeVoiceTranscript('  Trim five exterior doors.  '), 'Trim five exterior doors.');
  assert.throws(() => policy.normalizeVoiceTranscript(''), /required/);
  assert.throws(() => policy.normalizeVoiceTranscript('x'.repeat(12001)), /exceeds/);
  assert.strictEqual(policy.normalizeVoiceQuoteNumber(' Q-100 '), 'Q-100');
  assert.strictEqual(policy.normalizeVoiceQuoteId('not-a-uuid'), null);
  assert.strictEqual(policy.normalizeVoiceTranscriptStatus('added_to_quote'), 'added_to_quote');
  assert.throws(() => policy.normalizeVoiceTranscriptStatus('published'), /Unsupported/);
  assert.deepStrictEqual(
    policy.normalizeVoiceTranscriptSupportRequest(' OWNER@EXAMPLE.COM ', 'Case 1042 - reported missing doors'),
    { accountEmail: 'owner@example.com', caseReference: 'Case 1042 - reported missing doors' },
  );
  assert.throws(() => policy.normalizeVoiceTranscriptSupportRequest('owner@example.com', 'x'), /support case/);
  assert.strictEqual(policy.normalizeVoiceTranscriptSupportOffset('-3'), 0);
  assert.strictEqual(policy.normalizeVoiceTranscriptSupportOffset('50'), 50);

  const migration = read('supabase/migrations/20260807111159_ai_voice_transcript_history.sql');
  assert(migration.includes('create table if not exists public.ai_voice_transcripts'));
  assert(migration.includes('create table if not exists public.ai_voice_transcript_preferences'));
  assert(migration.includes('create table if not exists public.ai_voice_transcript_support_access'));
  assert(migration.includes('alter table public.ai_voice_transcripts enable row level security'));
  assert(migration.includes('using ((select auth.uid()) = user_id)'), 'owner policies should use auth.uid ownership checks');
  assert(migration.includes('grant select, delete on table public.ai_voice_transcripts to authenticated'), 'owners should have only history read/delete grants');
  assert(!migration.includes('grant select, insert, update, delete on table public.ai_voice_transcripts to authenticated'), 'browser users must not author trusted transcript metadata');
  assert(migration.includes('revoke all on table public.ai_voice_transcript_support_access from public, anon, authenticated'), 'support audit must be service-role only');
  assert(migration.includes('result_offset integer not null default 0'), 'each audited support page should record its transcript offset');
  assert(!migration.includes('Admin can read voice transcripts'), 'administrator browser sessions must not bypass transcript RLS');
  assert(migration.includes("source in ('web_speech_recognition')"), 'the schema should identify the text source without claiming audio capture');

  const edge = read('supabase/functions/voice-transcripts/index.ts');
  assert(edge.includes('isVoiceTranscriptNoticeAccepted(preference?.notice_version)'), 'text capture should accept the prior text-only notice during a cache-safe rollout');
  assert(edge.includes('notice_version: preference.notice_version'), 'stored transcript metadata should record the notice the user actually acknowledged');
  assert(edge.includes("account_email: String(user.email || '').trim().toLowerCase()"), 'account email must be server-authored');
  assert(edge.includes(".eq('user_id', user.id)"), 'transcript updates must remain owner scoped');
  assert(edge.includes("action === 'support_search'"));
  assert(edge.includes('normalizeVoiceTranscriptSupportRequest(body.accountEmail, body.caseReference)'), 'support lookup must require an exact email and case reason');
  const supportAction = edge.slice(edge.indexOf("if (action === 'support_search')"));
  assert(supportAction.indexOf(".from('ai_voice_transcript_support_access')") < supportAction.indexOf(".from('ai_voice_transcripts')"), 'the support access attempt must be recorded before transcripts are queried');
  assert(supportAction.indexOf('completed_at: new Date().toISOString()') < supportAction.indexOf('success: true,'), 'the completed audit must be saved before transcript data is returned');
  assert(supportAction.includes('VOICE_TRANSCRIPT_SUPPORT_PAGE_SIZE'), 'support review should use audited pagination instead of a final-result ceiling');
  assert(supportAction.includes('hasMore: nextOffset < Number(count || 0)'), 'support review should expose older transcript pages');
  assert(supportAction.includes('customerSafeTranscripts'), 'support responses should omit internal account user IDs');
  assert(supportAction.includes('transcripts: customerSafeTranscripts'));
  assert(edge.includes("'Cache-Control': 'no-store'"), 'transcript API responses must not be cached');
  assert(!/console\.(?:log|warn|error)/.test(edge), 'the transcript endpoint must not write transcripts or request objects to logs');

  const supabase = read('supabase-v2.js');
  assert(supabase.includes("const QD_AI_VOICE_TRANSCRIPT_NOTICE_VERSION = '2026-08-09-audio-v1'"));
  assert(supabase.includes(".from('ai_voice_transcript_preferences')"));
  assert(supabase.includes(".from('ai_voice_transcripts')"));
  assert(supabase.includes("action: 'capture'"));
  assert(supabase.includes("action: 'support_search'"));
  assert(supabase.includes(".eq('user_id', user.id)"), 'history queries should be owner scoped in addition to RLS');
  assert(supabase.includes("action: 'delete_transcript'"), 'transcript deletion must coordinate private audio and active holds through the Edge Function');

  const builder = read('quote-builder.html');
  assert(builder.includes('id="aiVoiceTranscriptNoticeModal"'));
  assert(builder.includes('id="aiVoiceTranscriptHistoryModal"'));
  assert(builder.includes('AI Voice Transcript History</a>'), 'history should be accessible without starting a new microphone session');
  assert(builder.includes('Other customers cannot access it. It is not sold or used for advertising.'));
  assert(builder.includes('QuoteDr staff do not routinely view your records.'));
  assert(builder.includes('Save private audio for 14 days'));
  assert(builder.includes('Transcript only'));
  assert(builder.includes('QuoteDr staff do not routinely access or listen to recordings.'));
  const submitStart = builder.indexOf('async function submitVoiceQuote()');
  const submitEnd = builder.indexOf('async function _addPreparedAiVoiceRoomItems', submitStart);
  const submit = builder.slice(submitStart, submitEnd);
  assert(submit.indexOf('captureAiVoiceTranscript') < submit.indexOf("functions/v1/parse-quote"), 'transcript capture must finish before parsing begins');
  assert(submit.indexOf('captureAiVoiceTranscript') < submit.indexOf('uploadAiVoiceAudioEvidence'), 'text capture must be confirmed before optional audio upload begins');
  assert(submit.includes("_updateActiveAiVoiceTranscript('parse_failed')"), 'failed parse attempts should remain identifiable in history');
  assert(builder.includes("_updateActiveAiVoiceTranscript('added_to_quote', result)"));
  assert(builder.includes('Submitted text transcripts are always saved to your account. Original audio is saved only when the setting above is on.'));

  const settings = read('settings.html');
  assert(settings.includes('id="aiVoiceSupportTabLink"'));
  assert(settings.includes('id="tab-ai-voice-support"'));
  assert(settings.includes("'ai-voice-support'"), 'AI Voice support must be part of the guarded administrator tab set');
  assert(settings.includes('Every transcript search and recording access is audited'));
  assert(settings.includes('id="aiVoiceSupportMoreBtn"'));
  assert(settings.includes('findAiVoiceTranscriptsForSupport(aiVoiceSupportAccountEmail, aiVoiceSupportCaseReference, aiVoiceSupportCaseReason, aiVoiceSupportOffset)'));
  assert(settings.includes('All saved transcripts are available in audited pages'));

  const privacy = read('privacy.html');
  const terms = read('terms.html');
  assert(privacy.includes('id="ai-voice-transcripts"'));
  assert(privacy.includes('Audio requires an explicit first-use choice'));
  assert(privacy.includes('Audio cannot be browsed generally'));
  assert(privacy.includes('retained for up to two years for security and accountability'));
  assert(privacy.includes('<strong>OpenAI:</strong> AI processing for features such as Voice To Quote'));
  assert(terms.includes('AI Features and Transcript Records'));
  assert(terms.includes('No QuoteDr audio recording begins before that decision'));
  assert(terms.includes('does not automatically guarantee a credit, refund, reimbursement, or other payment'));

  for (const [name, html] of [['quote-builder', builder], ['settings', settings]]) {
    const scripts = Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi));
    scripts.forEach((match, index) => {
      assert.doesNotThrow(
        () => new vm.Script(match[1], { filename: `${name}-inline-${index + 1}.js` }),
        `${name} inline script ${index + 1} should parse`,
      );
    });
  }

  const fixture = read('tests/ai-voice-transcript-history-standalone.html');
  assert(fixture.includes('Trim five exterior doors'));
  assert(fixture.includes('Support access is limited'));
  assert(fixture.includes('Save private audio for 14 days'));
  assert(fixture.includes('Transcript only'));
  assert(fixture.includes('id="continueBtn" disabled'));
  assert(fixture.includes("get('viewport') === 'mobile'"), 'the isolated fixture should support a narrow mobile layout check');

  console.log('ai voice transcript history tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
