const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function sourceFunction(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert(start >= 0, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not isolate ${name}`);
}

(async function run() {
  const client = read('supabase-v2.js');
  const edge = read('supabase/functions/voice-transcripts/index.ts');
  const policy = await import('../supabase/functions/_shared/voice-transcript-policy.mjs');

  assert.strictEqual(policy.normalizeVoiceTranscriptAudioPreference(true), true);
  assert.strictEqual(policy.normalizeVoiceTranscriptAudioPreference(false), false);
  assert.throws(
    () => policy.normalizeVoiceTranscriptAudioPreference('true'),
    /explicit Voice audio preference/i,
    'the server must reject implicit or string consent values',
  );

  const acknowledge = sourceFunction(client, 'acknowledgeAiVoiceTranscriptNotice');
  assert(acknowledge.includes("action: 'save_preference'"), 'the browser should use the authenticated server-owned preference action');
  assert(!acknowledge.includes(".from('ai_voice_transcript_preferences')"), 'the browser must not write the preference table directly');
  assert(acknowledge.includes('microphone access stays blocked'), 'privacy consent should remain synchronous and fail closed');
  assert(acknowledge.includes('preference.user_id === user.id'), 'the returned preference must belong to the account that initiated the choice');
  assert(acknowledge.includes('preference.save_audio_for_support === saveAudio'), 'the returned preference must confirm the exact requested choice');
  assert(acknowledge.includes('preference.audio_consent_version === QD_AI_VOICE_TRANSCRIPT_NOTICE_VERSION'), 'audio consent must confirm the current notice version');

  const preferenceActionStart = edge.indexOf("if (action === 'save_preference')");
  const captureActionStart = edge.indexOf("if (action === 'capture')");
  const authStart = edge.indexOf('const user = await authenticatedUser(req)');
  assert(authStart >= 0 && authStart < preferenceActionStart, 'authentication must finish before the preference write');
  assert(preferenceActionStart >= 0 && preferenceActionStart < captureActionStart, 'preference saving should be an explicit server action before transcript capture');
  const preferenceAction = edge.slice(preferenceActionStart, captureActionStart);
  assert(preferenceAction.includes('normalizeVoiceTranscriptAudioPreference(body.saveAudioForSupport)'), 'the server must require an explicit boolean choice');
  assert(preferenceAction.includes('user_id: user.id'), 'the server must author preference ownership from the validated user');
  assert(!preferenceAction.includes('body.userId'), 'the client must not select the preference owner');
  assert(preferenceAction.includes('notice_version: VOICE_TRANSCRIPT_NOTICE_VERSION'), 'the server must author the active notice version');
  assert(preferenceAction.includes(".upsert({"), 'the state replacement should be atomic');
  assert(preferenceAction.includes("{ onConflict: 'user_id' }"), 'retries must converge on the account primary key');
  assert(preferenceAction.includes(".select('user_id,"), 'the durable acknowledgement must return its server-authored owner');
  assert(preferenceAction.includes("return json({ success: true, preference: data })"), 'the endpoint must return a durable acknowledgement row');
  assert(!/console\.(?:log|warn|error)/.test(edge), 'the preference endpoint must not log consent or customer data');

  const requests = [];
  const context = {
    getCurrentUser: async () => ({ id: 'owner-1' }),
    qdAiVoiceTranscriptFunction: async (body) => {
      requests.push(body);
      return {
        success: true,
        preference: {
          user_id: 'owner-1',
          notice_version: '2026-08-09-audio-v1',
          acknowledged_at: '2026-08-10T12:00:00.000Z',
          save_audio_for_support: body.saveAudioForSupport,
          audio_consent_version: body.saveAudioForSupport ? '2026-08-09-audio-v1' : null,
          audio_consent_at: body.saveAudioForSupport ? '2026-08-10T12:00:00.000Z' : null,
        },
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(
    `const QD_AI_VOICE_TRANSCRIPT_NOTICE_VERSION = '2026-08-09-audio-v1';\n${acknowledge}\nthis.acknowledge = acknowledgeAiVoiceTranscriptNotice;`,
    context,
  );

  const audioPreference = await context.acknowledge({ saveAudioForSupport: true });
  assert.strictEqual(audioPreference.save_audio_for_support, true);
  assert.strictEqual(JSON.stringify(requests.shift()), JSON.stringify({ action: 'save_preference', saveAudioForSupport: true }));

  const transcriptPreference = await context.acknowledge({ saveAudioForSupport: false });
  assert.strictEqual(transcriptPreference.save_audio_for_support, false);
  assert.strictEqual(JSON.stringify(requests.shift()), JSON.stringify({ action: 'save_preference', saveAudioForSupport: false }));

  context.qdAiVoiceTranscriptFunction = async () => ({
    success: true,
    preference: {
      user_id: 'owner-1',
      notice_version: '2026-08-09-audio-v1',
      acknowledged_at: '2026-08-10T12:00:00.000Z',
      save_audio_for_support: true,
      audio_consent_version: '2026-08-09-audio-v1',
      audio_consent_at: '2026-08-10T12:00:00.000Z',
    },
  });
  await assert.rejects(
    context.acknowledge({ saveAudioForSupport: false }),
    /could not confirm your AI Voice privacy choice/i,
    'a stale or mismatched server acknowledgement must not unlock microphone use',
  );

  context.qdAiVoiceTranscriptFunction = async () => ({
    success: true,
    preference: {
      user_id: 'owner-2',
      notice_version: '2026-08-09-audio-v1',
      acknowledged_at: '2026-08-10T12:00:00.000Z',
      save_audio_for_support: false,
      audio_consent_version: null,
      audio_consent_at: null,
    },
  });
  await assert.rejects(
    context.acknowledge({ saveAudioForSupport: false }),
    /could not confirm your AI Voice privacy choice/i,
    'an acknowledgement for another account must not unlock microphone use',
  );

  console.log('ai voice preference durability tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
