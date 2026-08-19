const assert = require('assert');
const recorderApi = require('../ai-voice-audio-recorder.js');

function fakeStream() {
  const track = { kind: 'audio', readyState: 'live', stopped: false, stop() { this.stopped = true; this.readyState = 'ended'; } };
  return { track, getTracks() { return [track]; }, getAudioTracks() { return [track]; } };
}

function createRecorderClass(supported, defaultMime) {
  class FakeMediaRecorder {
    static isTypeSupported(type) { return supported.includes(type); }
    constructor(stream, options) {
      this.stream = stream;
      this.options = options || {};
      this.mimeType = this.options.mimeType || defaultMime || '';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onerror = null;
      this.onstop = null;
    }
    start() { this.state = 'recording'; }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      queueMicrotask(() => { if (this.onstop) this.onstop(); });
    }
    emit(blob) { if (this.ondataavailable) this.ondataavailable({ data: blob }); }
  }
  return FakeMediaRecorder;
}

(async function run() {
  const androidChrome = createRecorderClass(['audio/webm;codecs=opus', 'audio/webm'], 'audio/webm');
  assert.strictEqual(recorderApi.selectRecorderFormat(androidChrome).mimeType, 'audio/webm;codecs=opus', 'Android Chrome should prefer Opus WebM');

  const iphoneSafari = createRecorderClass(['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'], 'audio/mp4');
  assert.strictEqual(recorderApi.selectRecorderFormat(iphoneSafari).mimeType, 'audio/mp4;codecs=mp4a.40.2', 'iPhone Safari should use its AAC/MP4 path when Opus is unavailable');

  const desktopFirefox = createRecorderClass(['audio/ogg;codecs=opus'], 'audio/ogg');
  assert.strictEqual(recorderApi.selectRecorderFormat(desktopFirefox).mimeType, 'audio/ogg;codecs=opus', 'desktop browsers can safely fall back to Opus Ogg');

  class BrowserDefaultRecorder extends createRecorderClass([], 'audio/mp4') {}
  BrowserDefaultRecorder.isTypeSupported = undefined;
  assert.strictEqual(recorderApi.selectRecorderFormat(BrowserDefaultRecorder).browserDefault, true, 'feature detection should allow a validated browser-selected format');

  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const deniedSession = new recorderApi.AudioCaptureSession({
    mediaDevices: { getUserMedia: async () => { throw denied; } },
    MediaRecorder: androidChrome,
    Blob,
  });
  await assert.rejects(deniedSession.start(), (error) => error.code === 'permission_denied' && /No audio was saved/.test(error.message));

  const unsupportedStream = fakeStream();
  class UnsupportedRecorder extends createRecorderClass([], 'audio/wav') {}
  UnsupportedRecorder.isTypeSupported = undefined;
  const unsupportedSession = new recorderApi.AudioCaptureSession({
    mediaDevices: { getUserMedia: async () => unsupportedStream },
    MediaRecorder: UnsupportedRecorder,
    Blob,
  });
  await assert.rejects(unsupportedSession.start(), (error) => error.code === 'unsupported_mime');
  assert.strictEqual(unsupportedStream.track.stopped, true, 'unsupported recorders must release the microphone immediately');

  let now = 100;
  const stream = fakeStream();
  const session = new recorderApi.AudioCaptureSession({
    mediaDevices: { getUserMedia: async () => stream },
    MediaRecorder: androidChrome,
    Blob,
    now: () => now,
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  const started = await session.start();
  assert.strictEqual(started.mimeType, 'audio/webm;codecs=opus');
  assert.strictEqual(session.recorder.options.audioBitsPerSecond, recorderApi.REQUESTED_BITS_PER_SECOND, 'the browser should be asked for compressed audio without assuming it will honor the bitrate');
  assert.strictEqual(session.getAudioTrack(), stream.track, 'speech recognition and evidence recording must be able to share the same live microphone track');
  session.recorder.emit(new Blob([new Uint8Array(1200)], { type: 'audio/webm;codecs=opus' }));
  now = 1100;
  assert.strictEqual(session.pause(), true);
  now = 5100;
  assert.strictEqual(session.resume(), true);
  now = 6100;
  const completed = await session.stop();
  assert.strictEqual(completed.byteSize, 1200);
  assert.strictEqual(completed.durationMs, 2000, 'paused time must not count toward the five-minute limit');
  assert.strictEqual(completed.mimeType, 'audio/webm;codecs=opus');
  assert.strictEqual(stream.track.stopped, true, 'completed capture must always release the microphone');

  const discardStream = fakeStream();
  const discardSession = new recorderApi.AudioCaptureSession({
    mediaDevices: { getUserMedia: async () => discardStream },
    MediaRecorder: androidChrome,
    Blob,
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  await discardSession.start();
  discardSession.recorder.emit(new Blob([new Uint8Array(400)], { type: 'audio/webm' }));
  const discarded = await discardSession.discard();
  assert.strictEqual(discarded.blob, null, 'cancelled capture must not retain an audio blob');
  assert.strictEqual(discardStream.track.stopped, true);

  const interruptedStream = fakeStream();
  class InterruptedRecorder extends androidChrome {
    stop() { throw new Error('device disconnected'); }
  }
  const interruptedSession = new recorderApi.AudioCaptureSession({
    mediaDevices: { getUserMedia: async () => interruptedStream },
    MediaRecorder: InterruptedRecorder,
    Blob,
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  await interruptedSession.start();
  await assert.rejects(interruptedSession.stop(), (error) => error.code === 'recording_error');
  assert.strictEqual(interruptedStream.track.stopped, true, 'interrupted recording must release the microphone and reject instead of hanging');

  console.log('ai voice audio recorder tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
