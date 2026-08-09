const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return source.slice(start, end);
}

(async function run() {
  const policy = await import('../supabase/functions/_shared/voice-audio-policy.mjs');
  assert.strictEqual(policy.VOICE_AUDIO_NOTICE_VERSION, '2026-08-09-audio-v1');
  assert.strictEqual(policy.VOICE_AUDIO_RETENTION_DAYS, 14);
  assert.strictEqual(policy.VOICE_AUDIO_POST_CASE_RETENTION_DAYS, 30);
  assert.strictEqual(policy.VOICE_AUDIO_MAX_DURATION_MS, 300000);
  assert.strictEqual(policy.VOICE_AUDIO_MAX_BYTES, 6 * 1024 * 1024);
  assert.strictEqual(policy.VOICE_AUDIO_ACCOUNT_CAP_BYTES, 100 * 1024 * 1024);
  assert.strictEqual(policy.VOICE_AUDIO_SIGNED_URL_SECONDS, 60);
  assert.strictEqual(policy.normalizeVoiceAudioMimeType('Audio/WebM;Codecs=Opus'), 'audio/webm;codecs=opus');
  assert.strictEqual(policy.voiceAudioExtension('audio/mp4;codecs=mp4a.40.2'), 'm4a');
  assert.throws(() => policy.normalizeVoiceAudioMimeType('audio/wav'), /Unsupported/);
  assert.throws(() => policy.normalizeVoiceAudioDurationMs(300001), /five minutes|5 minutes/);
  assert.throws(() => policy.normalizeVoiceAudioByteSize((6 * 1024 * 1024) + 1), /smaller than 6 MB/);
  assert.deepStrictEqual(
    policy.normalizeVoiceAudioCase(' QD-1042 ', ' Compare spoken door count '),
    { caseReference: 'QD-1042', caseReason: 'Compare spoken door count' },
  );

  const now = new Date('2026-08-08T12:00:00Z');
  const baseRecord = {
    id: 'recording-id', transcript_id: 'transcript-id', user_id: 'private-owner-id', object_path: 'private/path.webm',
    mime_type: 'audio/webm', duration_ms: 10000, byte_size: 1000, upload_status: 'ready',
    created_at: '2026-08-01T00:00:00Z', expires_at: '2026-08-07T00:00:00Z', support_hold_state: 'none', deleted_at: null,
  };
  assert.strictEqual(policy.isVoiceAudioExpired(baseRecord, now), true, 'ordinary audio must expire server-side after its deadline');
  assert.strictEqual(policy.isVoiceAudioExpired({ ...baseRecord, support_hold_state: 'active' }, now), false, 'an active explicitly authorized case pauses expiry');
  assert.strictEqual(policy.isVoiceAudioExpired({
    ...baseRecord,
    support_hold_state: 'closed',
    support_case_closed_at: '2026-08-01T00:00:00Z',
    post_case_delete_at: '2026-09-07T00:00:00Z',
  }, now), false, 'a closed case uses its defined post-case deletion date');
  assert.strictEqual(policy.isVoiceAudioExpired({
    ...baseRecord,
    support_hold_state: 'closed',
    post_case_delete_at: '2026-08-07T23:59:59Z',
  }, now), true, 'post-case audio must become due after the defined 30-day deadline');
  const safe = policy.safeVoiceAudioRecording({ ...baseRecord, expires_at: '2026-08-22T00:00:00Z' });
  assert.strictEqual(safe.playbackAvailable, true);
  assert.strictEqual(Object.hasOwn(safe, 'objectPath'), false, 'browser metadata must not expose the private object path');
  assert.strictEqual(Object.hasOwn(safe, 'userId'), false, 'browser metadata must not expose internal owner IDs');
  assert.strictEqual(policy.safeVoiceAudioRecording({ ...baseRecord, support_hold_state: 'active' }).canDelete, false, 'active authorized holds must prevent immediate deletion until closed');
  assert.strictEqual(policy.voiceAudioQuotaSummary(95 * 1024 * 1024).nearLimit, true, 'users must be warned before a maximum-size capture could be blocked');

  const migration = read('supabase/migrations/20260809005241_ai_voice_audio_evidence.sql');
  assert(migration.includes("'ai-voice-audio-evidence'"));
  assert(migration.includes('public = false'), 'the Storage bucket must stay private');
  assert(migration.includes('file_size_limit'));
  assert(migration.includes("default (now() + interval '14 days')"));
  assert(migration.includes("support_hold_state in ('none', 'active', 'closed')"));
  assert(migration.includes('post_case_delete_at'));
  assert(migration.includes("upload_status in ('upload_pending', 'ready', 'deletion_pending', 'failed', 'deleted', 'expired')"));
  assert(migration.includes('unique (user_id, idempotency_key)'));
  assert(migration.includes('unique (transcript_id)'));
  assert(migration.includes('pg_advisory_xact_lock'), 'reservation and finalization quota checks must be serialized per account');
  assert(migration.includes('voice_audio_consent_required'));
  assert(migration.includes('revoke all on table public.ai_voice_audio_recordings from public, anon, authenticated'));
  assert(migration.includes('grant select, insert, update, delete on table public.ai_voice_audio_recordings to service_role'));
  assert(!migration.includes('create policy "ai_voice_audio_owner_'), 'direct Storage access must remain deny-by-default');
  assert(!/\b(bytea|audio_blob|audio_data)\b/i.test(migration), 'Postgres must hold metadata only, never recording bytes');
  assert(migration.includes('revoke delete on table public.ai_voice_transcripts from authenticated'), 'active audio holds must not be bypassed by a direct transcript delete');
  assert.strictEqual((migration.match(/set search_path = ''/g) || []).length, 2, 'service-only security definer functions must use an empty search path');

  const edge = read('supabase/functions/voice-audio/index.ts');
  assert(!/console\.(?:log|warn|error)/.test(edge), 'audio paths, account details, and support reasons must not be logged');
  assert(edge.includes("createSignedUploadUrl(record.object_path, { upsert: true })"), 'retry uploads must be idempotent at their unique path');
  assert(edge.includes('createSignedUrl(record.object_path, VOICE_AUDIO_SIGNED_URL_SECONDS)'));
  assert(edge.includes("action === 'cleanup_expired'"));
  assert(edge.includes(".eq('upload_status', 'deletion_pending')"), 'automatic deletion must be retryable after interrupted Storage removal');
  assert(edge.includes("upload_status: removed ? 'failed' : 'deletion_pending'"), 'failed invalid-object removal must stay in the retry queue');
  assert(edge.includes("originalReason === 'invalid_upload'"), 'cleanup must retry invalid Storage orphans');
  assert(edge.includes("requestedDeletion ? 'deleted' : 'expired'"), 'cleanup retries must preserve user-deletion versus expiry status');
  assert(edge.includes(".eq('support_hold_state', 'none').lte('expires_at', nowIso)"), 'cleanup must not delete active holds');
  assert(edge.includes(".eq('support_hold_state', 'closed').lte('post_case_delete_at', nowIso)"), 'closed cases must use the 30-day deadline');
  assert(edge.includes("action === 'preserve_for_support'"));
  assert(edge.includes('body.authorizationConfirmed !== true'));
  assert(edge.includes("record.support_hold_state !== 'active' || record.support_case_reference !== caseDetails.caseReference"));
  assert(edge.includes(".eq('account_email', accountEmail)"), 'support retrieval must verify the exact account identity server-side');
  const supportPlayback = edge.slice(edge.indexOf("if (action === 'support_playback' || action === 'support_close_case')"));
  assert(supportPlayback.indexOf('startAudit(service') < supportPlayback.indexOf(".from('ai_voice_audio_recordings')"), 'support access must be audited before recording metadata is queried');
  assert(edge.includes("'Cache-Control': 'no-store'"));

  const schedule = read('supabase/ai_voice_audio_cleanup_schedule.sql');
  assert(schedule.includes('MANUAL DEPLOYMENT STEP'));
  assert(schedule.includes('voice_audio_cleanup_token'));
  assert(schedule.includes("'17 * * * *'"), 'server cleanup must run automatically after deployment activation');
  assert(schedule.includes('Missing required Vault secrets'), 'cleanup activation must fail closed if secrets are missing');
  assert(schedule.includes('begin;') && schedule.includes('commit;'), 'schedule replacement must be transactional');

  const client = read('supabase-v2.js');
  assert(!client.includes('SUPABASE_SERVICE_ROLE_KEY'), 'the browser must never receive a service-role key');
  assert(client.includes("uploadToSignedUrl(prepared.upload.path, prepared.upload.token"));
  assert(client.includes("action: 'owner_playback'"));
  assert(client.includes("action: 'preserve_for_support'"));
  assert(client.includes("action: 'support_playback'"));
  assert(client.includes("action: 'delete_transcript'"));

  const uploadSource = sourceBetween(client, 'async function uploadAiVoiceAudioEvidence', 'async function getOwnerAiVoiceAudioRecordings');
  function buildUploadHelper(qdFunction, uploadToSignedUrl) {
    return new Function(
      'qdAiVoiceAudioFunction', 'createAiVoiceAudioIdempotencyKey', 'QD_AI_VOICE_AUDIO_BUCKET', '_supabase',
      `${uploadSource}\nreturn uploadAiVoiceAudioEvidence;`,
    )(
      qdFunction,
      () => '00000000-0000-4000-8000-000000000001',
      'ai-voice-audio-evidence',
      { storage: { from: () => ({ uploadToSignedUrl }) } },
    );
  }
  const testCapture = { blob: new Blob([new Uint8Array(1000)], { type: 'audio/webm' }), mimeType: 'audio/webm;codecs=opus', durationMs: 1000 };
  let finalizeCalls = 0;
  const interruptedUpload = buildUploadHelper(
    async (body) => {
      if (body.action === 'finalize_upload') finalizeCalls += 1;
      return { alreadyFinalized: false, recording: { id: 'recording-1' }, upload: { bucket: 'ai-voice-audio-evidence', path: 'owner/transcript/audio.webm', token: 'signed-token' } };
    },
    async () => ({ error: new Error('offline') }),
  );
  await assert.rejects(
    interruptedUpload('transcript-1', testCapture, '00000000-0000-4000-8000-000000000002'),
    (error) => error.code === 'audio_upload_interrupted' && error.idempotencyKey === '00000000-0000-4000-8000-000000000002',
    'an offline upload must retain the retry key without pretending audio was finalized',
  );
  assert.strictEqual(finalizeCalls, 0);

  const retryActions = [];
  const successfulRetry = buildUploadHelper(
    async (body) => {
      retryActions.push(body.action);
      if (body.action === 'prepare_upload') return { alreadyFinalized: false, recording: { id: 'recording-1' }, upload: { bucket: 'ai-voice-audio-evidence', path: 'owner/transcript/audio.webm', token: 'new-signed-token' } };
      return { recording: { id: 'recording-1', uploadStatus: 'ready' }, alreadyFinalized: false };
    },
    async (_path, _token, _blob, options) => {
      assert.strictEqual(options.contentType, 'audio/webm', 'Storage MIME restrictions should receive the base MIME type');
      return { error: null };
    },
  );
  const retried = await successfulRetry('transcript-1', testCapture, '00000000-0000-4000-8000-000000000002');
  assert.deepStrictEqual(retryActions, ['prepare_upload', 'finalize_upload']);
  assert.strictEqual(retried.recording.uploadStatus, 'ready');

  let duplicateUploadCalled = false;
  const duplicateFinalize = buildUploadHelper(
    async () => ({ alreadyFinalized: true, recording: { id: 'recording-1', uploadStatus: 'ready' } }),
    async () => { duplicateUploadCalled = true; return { error: null }; },
  );
  const duplicate = await duplicateFinalize('transcript-1', testCapture, '00000000-0000-4000-8000-000000000002');
  assert.strictEqual(duplicate.alreadyFinalized, true);
  assert.strictEqual(duplicateUploadCalled, false, 'duplicate finalization must not upload a second object');

  const builder = read('quote-builder.html');
  const submit = builder.slice(builder.indexOf('async function submitVoiceQuote()'), builder.indexOf('async function _addPreparedAiVoiceRoomItems'));
  assert(submit.indexOf('captureAiVoiceTranscript') < submit.indexOf('uploadAiVoiceAudioEvidence'), 'the transcript must be confirmed before optional audio upload');
  assert(submit.indexOf('uploadAiVoiceAudioEvidence') < submit.indexOf("functions/v1/parse-quote"), 'optional evidence upload should be attempted before parsing');
  assert(submit.includes('_voiceAudioRetryPayload'), 'interrupted upload must preserve an in-memory retry without losing the transcript');
  assert(submit.includes('quote parsing will continue'), 'audio failure must degrade safely');
  const firstUseAudioChoice = builder.match(/<input[^>]+id="aiVoiceConsentSaveAudio"[^>]*>/i);
  const firstUseTranscriptChoice = builder.match(/<input[^>]+id="aiVoiceConsentTranscriptOnly"[^>]*>/i);
  assert(firstUseAudioChoice && firstUseTranscriptChoice, 'first use must offer both private audio and transcript-only choices');
  assert(!/\bchecked\b/i.test(firstUseAudioChoice[0]) && !/\bchecked\b/i.test(firstUseTranscriptChoice[0]), 'neither first-use choice may be preselected');
  assert(/id="aiVoiceTranscriptNoticeContinue"[^>]*\bdisabled\b/i.test(builder), 'continue must remain disabled until the user chooses');
  const noticeFlow = sourceBetween(builder, 'function _showAiVoiceTranscriptNotice', 'async function ensureAiVoiceTranscriptNotice');
  assert(noticeFlow.includes("input.checked = false"), 'each first-use display must require a fresh explicit choice');
  assert(noticeFlow.includes("selected.value === 'audio'"), 'the chosen account default must be saved explicitly');
  const startFlow = sourceBetween(builder, 'async function startVoiceQuote()', 'function toggleVoiceRecording()');
  assert(startFlow.indexOf('ensureAiVoiceTranscriptNotice') < startFlow.indexOf("new bootstrap.Modal(document.getElementById('voiceQuoteModal'))"), 'the consent decision must finish before the recording UI opens');
  assert(builder.includes('Save private audio for 14 days'));
  assert(builder.includes('Transcript only'));
  assert(builder.includes('QuoteDr staff do not routinely access or listen to recordings.'));
  assert(builder.includes('Access is case-bound and audited.'));
  assert(builder.includes('Avoid dictating access codes or unnecessary sensitive information.'));
  assert(builder.includes('id="voiceAudioCurrentChoice"'));
  assert(builder.includes('id="voiceAudioLiveIndicator"'));
  assert(builder.includes('Private audio recording'));
  assert(builder.includes('Transcript listening only'));
  assert(builder.includes('Pause before any private conversation.'));
  assert(builder.includes('Audio is investigation evidence for human review, not automatic proof'));
  assert(builder.includes('id="aiVoicePreserveAuthorize" required'));
  assert(builder.includes('End Support Hold'));
  assert(builder.includes('Play Privately'));

  const settings = read('settings.html');
  assert(settings.includes('id="aiVoiceSupportEmail"'));
  assert(settings.includes('id="aiVoiceSupportCase"'));
  assert(settings.includes('id="aiVoiceSupportReason"'));
  assert(settings.includes('Owner-authorized original audio'));
  assert(settings.includes('Audited Playback'));
  assert(settings.includes('Close Case Hold'));

  const privacy = read('privacy.html');
  const terms = read('terms.html');
  assert(privacy.includes('Audio requires an explicit first-use choice'));
  assert(privacy.includes('QuoteDr does not begin recording before that decision'));
  assert(privacy.includes('scheduled for automatic deletion from active storage 14 days after capture'));
  assert(privacy.includes('30-day post-case period'));
  assert(privacy.includes('Audio cannot be browsed generally'));
  assert(privacy.includes('staff do not routinely view transcripts'));
  assert(privacy.includes('staff do not routinely access or listen to recordings'));
  assert(privacy.includes('Avoid dictating access codes or unnecessary sensitive information'));
  assert(privacy.includes('not represented as legal proof'));
  assert(!privacy.includes('No stored microphone audio'));
  assert(terms.includes('No QuoteDr audio recording begins before that decision'));
  assert(terms.includes('Access is case-bound and audited'));

  const browserFixture = read('tests/ai-voice-audio-evidence-browser-fixture.html');
  assert(browserFixture.includes('Synthetic audio only'));
  assert(browserFixture.includes('Android / Chrome'));
  assert(browserFixture.includes('iPhone / Safari'));
  assert(browserFixture.includes('Desktop fallback'));
  assert(browserFixture.includes('Current account default:'));
  assert(browserFixture.includes('id="fixtureLiveIndicator"'));
  assert(browserFixture.includes('Private audio recording'));
  assert(browserFixture.includes('id="pauseCheck" disabled'));
  assert(browserFixture.includes('microphone capture is paused'));
  assert(browserFixture.includes('The measured Blob was discarded and was not uploaded or saved.'));

  for (const [name, html] of [['quote-builder', builder], ['settings', settings]]) {
    Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)).forEach((match, index) => {
      assert.doesNotThrow(() => new vm.Script(match[1], { filename: `${name}-inline-${index + 1}.js` }));
    });
  }

  console.log('ai voice audio evidence tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
