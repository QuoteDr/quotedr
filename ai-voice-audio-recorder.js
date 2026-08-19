(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QdAiVoiceAudioRecorder = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function() {
    'use strict';

    var MAX_DURATION_MS = 5 * 60 * 1000;
    var MAX_BYTES = 6 * 1024 * 1024;
    var REQUESTED_BITS_PER_SECOND = 48000;
    var FORMAT_CANDIDATES = Object.freeze([
        Object.freeze({ mimeType: 'audio/webm;codecs=opus', extension: 'webm', label: 'Opus' }),
        Object.freeze({ mimeType: 'audio/ogg;codecs=opus', extension: 'ogg', label: 'Opus' }),
        Object.freeze({ mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a', label: 'AAC' }),
        Object.freeze({ mimeType: 'audio/mp4', extension: 'm4a', label: 'MP4 audio' }),
        Object.freeze({ mimeType: 'audio/webm', extension: 'webm', label: 'WebM audio' })
    ]);
    var ALLOWED_BASE_MIME_TYPES = Object.freeze(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac']);

    function baseMimeType(value) {
        return String(value || '').split(';')[0].trim().toLowerCase();
    }

    function isAllowedMimeType(value) {
        return ALLOWED_BASE_MIME_TYPES.indexOf(baseMimeType(value)) !== -1;
    }

    function extensionForMimeType(value) {
        var base = baseMimeType(value);
        if (base === 'audio/webm') return 'webm';
        if (base === 'audio/ogg') return 'ogg';
        if (base === 'audio/mp4') return 'm4a';
        if (base === 'audio/aac') return 'aac';
        return '';
    }

    function selectRecorderFormat(MediaRecorderCtor) {
        if (!MediaRecorderCtor) return null;
        var canCheck = typeof MediaRecorderCtor.isTypeSupported === 'function';
        if (canCheck) {
            for (var i = 0; i < FORMAT_CANDIDATES.length; i++) {
                if (MediaRecorderCtor.isTypeSupported(FORMAT_CANDIDATES[i].mimeType)) {
                    return Object.assign({ browserDefault: false }, FORMAT_CANDIDATES[i]);
                }
            }
        }
        return { mimeType: '', extension: '', label: 'Browser-selected audio', browserDefault: true };
    }

    function stopTracks(stream) {
        if (!stream || typeof stream.getTracks !== 'function') return;
        stream.getTracks().forEach(function(track) {
            try { track.stop(); } catch (_) {}
        });
    }

    function AudioCaptureError(code, message) {
        this.name = 'AudioCaptureError';
        this.code = code;
        this.message = message;
        if (Error.captureStackTrace) Error.captureStackTrace(this, AudioCaptureError);
    }
    AudioCaptureError.prototype = Object.create(Error.prototype);
    AudioCaptureError.prototype.constructor = AudioCaptureError;

    function AudioCaptureSession(options) {
        options = options || {};
        this.mediaDevices = options.mediaDevices || (typeof navigator !== 'undefined' ? navigator.mediaDevices : null);
        this.MediaRecorderCtor = options.MediaRecorder || (typeof MediaRecorder !== 'undefined' ? MediaRecorder : null);
        this.BlobCtor = options.Blob || (typeof Blob !== 'undefined' ? Blob : null);
        this.now = options.now || function() { return Date.now(); };
        this.setTimer = options.setTimeout || function(callback, delay) { return setTimeout(callback, delay); };
        this.clearTimer = options.clearTimeout || function(timerId) { return clearTimeout(timerId); };
        this.maxDurationMs = Math.min(MAX_DURATION_MS, Math.max(1000, Number(options.maxDurationMs) || MAX_DURATION_MS));
        this.maxBytes = Math.min(MAX_BYTES, Math.max(1024, Number(options.maxBytes) || MAX_BYTES));
        this.onLimit = typeof options.onLimit === 'function' ? options.onLimit : function() {};
        this.onChunk = typeof options.onChunk === 'function' ? options.onChunk : function() {};
        this.stream = null;
        this.recorder = null;
        this.chunks = [];
        this.byteSize = 0;
        this.accumulatedMs = 0;
        this.segmentStartedAt = 0;
        this.limitReason = '';
        this.pauseSupported = true;
        this._maxTimer = null;
        this._stopPromise = null;
        this._resolveStop = null;
        this._rejectStop = null;
        this._discarded = false;
    }

    AudioCaptureSession.prototype._elapsedMs = function() {
        var running = this.segmentStartedAt ? Math.max(0, this.now() - this.segmentStartedAt) : 0;
        return Math.min(this.maxDurationMs, Math.max(0, Math.round(this.accumulatedMs + running)));
    };

    AudioCaptureSession.prototype._finishSegment = function() {
        if (!this.segmentStartedAt) return;
        this.accumulatedMs += Math.max(0, this.now() - this.segmentStartedAt);
        this.segmentStartedAt = 0;
    };

    AudioCaptureSession.prototype._cleanupStream = function() {
        if (this._maxTimer) this.clearTimer(this._maxTimer);
        this._maxTimer = null;
        stopTracks(this.stream);
        this.stream = null;
    };

    AudioCaptureSession.prototype.getAudioTrack = function() {
        if (!this.stream) return null;
        if (typeof this.stream.getAudioTracks === 'function') {
            return this.stream.getAudioTracks()[0] || null;
        }
        if (typeof this.stream.getTracks === 'function') {
            return this.stream.getTracks().find(function(track) {
                return track && (!track.kind || track.kind === 'audio');
            }) || null;
        }
        return null;
    };

    AudioCaptureSession.prototype._scheduleDurationLimit = function() {
        if (this._maxTimer) this.clearTimer(this._maxTimer);
        this._maxTimer = null;
        var self = this;
        var remainingMs = Math.max(0, this.maxDurationMs - this._elapsedMs());
        if (!remainingMs) {
            if (!this.limitReason) {
                this.limitReason = 'duration';
                this.onLimit({ reason: 'duration', byteSize: this.byteSize, durationMs: this._elapsedMs() });
                this.stop();
            }
            return;
        }
        this._maxTimer = this.setTimer(function() {
            if (self.limitReason) return;
            self.limitReason = 'duration';
            self.onLimit({ reason: 'duration', byteSize: self.byteSize, durationMs: self._elapsedMs() });
            self.stop();
        }, remainingMs);
    };

    AudioCaptureSession.prototype.start = async function() {
        if (!this.mediaDevices || typeof this.mediaDevices.getUserMedia !== 'function' || !this.MediaRecorderCtor || !this.BlobCtor) {
            throw new AudioCaptureError('unsupported', 'This browser cannot save microphone audio. Text transcription can still continue.');
        }
        if (this.recorder) throw new AudioCaptureError('already_started', 'Audio recording has already started.');
        try {
            this.stream = await this.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
        } catch (error) {
            var denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
            throw new AudioCaptureError(denied ? 'permission_denied' : 'microphone_unavailable', denied
                ? 'Microphone permission was denied. No audio was saved.'
                : 'The microphone could not be opened for audio evidence.');
        }

        var format = selectRecorderFormat(this.MediaRecorderCtor);
        try {
            var recorderOptions = { audioBitsPerSecond: REQUESTED_BITS_PER_SECOND };
            if (format && format.mimeType) recorderOptions.mimeType = format.mimeType;
            try {
                this.recorder = new this.MediaRecorderCtor(this.stream, recorderOptions);
            } catch (_) {
                this.recorder = new this.MediaRecorderCtor(this.stream);
            }
        } catch (error) {
            this._cleanupStream();
            throw new AudioCaptureError('recorder_failed', 'This browser could not start a compatible audio recorder.');
        }

        var actualMime = this.recorder.mimeType || (format && format.mimeType) || '';
        if (actualMime && !isAllowedMimeType(actualMime)) {
            this._cleanupStream();
            this.recorder = null;
            throw new AudioCaptureError('unsupported_mime', 'This browser selected an unsupported recording format. No audio was saved.');
        }

        var self = this;
        this._stopPromise = new Promise(function(resolve, reject) {
            self._resolveStop = resolve;
            self._rejectStop = reject;
        });
        this.recorder.ondataavailable = function(event) {
            var chunk = event && event.data;
            if (!chunk || !chunk.size) return;
            self.chunks.push(chunk);
            self.byteSize += Number(chunk.size) || 0;
            self.onChunk({ byteSize: self.byteSize, durationMs: self._elapsedMs() });
            if (self.byteSize > self.maxBytes && !self.limitReason) {
                self.limitReason = 'size';
                self.onLimit({ reason: 'size', byteSize: self.byteSize, durationMs: self._elapsedMs() });
                self.stop();
            }
        };
        this.recorder.onerror = function(event) {
            self._finishSegment();
            self._cleanupStream();
            if (self._rejectStop) self._rejectStop(new AudioCaptureError('recording_error', (event && event.error && event.error.message) || 'Audio recording failed.'));
            self._resolveStop = null;
            self._rejectStop = null;
        };
        this.recorder.onstop = function() {
            self._finishSegment();
            self._cleanupStream();
            var mimeType = self.recorder.mimeType || (self.chunks[0] && self.chunks[0].type) || actualMime;
            if (!isAllowedMimeType(mimeType)) {
                if (self._rejectStop) self._rejectStop(new AudioCaptureError('unsupported_mime', 'The completed recording format is not supported.'));
            } else if (self._resolveStop) {
                var blob = new self.BlobCtor(self.chunks, { type: mimeType });
                self._resolveStop({
                    blob: self._discarded ? null : blob,
                    mimeType: mimeType,
                    extension: extensionForMimeType(mimeType),
                    durationMs: self._elapsedMs(),
                    byteSize: Number(blob.size) || self.byteSize,
                    limitReason: self.limitReason || ''
                });
            }
            self._resolveStop = null;
            self._rejectStop = null;
        };

        try {
            this.recorder.start(1000);
        } catch (error) {
            this._cleanupStream();
            this.recorder = null;
            throw new AudioCaptureError('recorder_failed', 'This browser could not start audio recording.');
        }
        this.segmentStartedAt = this.now();
        this._scheduleDurationLimit();
        return {
            mimeType: actualMime || 'browser-selected',
            formatLabel: (format && format.label) || 'Browser-selected audio',
            maxDurationMs: this.maxDurationMs,
            maxBytes: this.maxBytes
        };
    };

    AudioCaptureSession.prototype.pause = function() {
        if (!this.recorder || this.recorder.state !== 'recording') return false;
        if (typeof this.recorder.pause !== 'function') {
            this.pauseSupported = false;
            return false;
        }
        try {
            this._finishSegment();
            if (this._maxTimer) this.clearTimer(this._maxTimer);
            this._maxTimer = null;
            this.recorder.pause();
            return true;
        } catch (_) {
            this.segmentStartedAt = this.now();
            this.pauseSupported = false;
            return false;
        }
    };

    AudioCaptureSession.prototype.resume = function() {
        if (!this.recorder || this.recorder.state !== 'paused') return false;
        if (typeof this.recorder.resume !== 'function') return false;
        try {
            this.recorder.resume();
            this.segmentStartedAt = this.now();
            this._scheduleDurationLimit();
            return true;
        } catch (_) {
            return false;
        }
    };

    AudioCaptureSession.prototype.stop = function() {
        if (!this.recorder) return Promise.resolve(null);
        if (this.recorder.state === 'inactive') return this._stopPromise || Promise.resolve(null);
        this._finishSegment();
        try {
            this.recorder.stop();
        } catch (_) {
            this._cleanupStream();
            if (this._rejectStop) this._rejectStop(new AudioCaptureError('recording_error', 'Audio recording could not be completed.'));
            this._resolveStop = null;
            this._rejectStop = null;
        }
        return this._stopPromise;
    };

    AudioCaptureSession.prototype.discard = function() {
        this._discarded = true;
        this.chunks = [];
        this.byteSize = 0;
        return this.stop().catch(function() { return null; });
    };

    return Object.freeze({
        MAX_DURATION_MS: MAX_DURATION_MS,
        MAX_BYTES: MAX_BYTES,
        REQUESTED_BITS_PER_SECOND: REQUESTED_BITS_PER_SECOND,
        FORMAT_CANDIDATES: FORMAT_CANDIDATES,
        ALLOWED_BASE_MIME_TYPES: ALLOWED_BASE_MIME_TYPES,
        baseMimeType: baseMimeType,
        isAllowedMimeType: isAllowedMimeType,
        extensionForMimeType: extensionForMimeType,
        selectRecorderFormat: selectRecorderFormat,
        AudioCaptureError: AudioCaptureError,
        AudioCaptureSession: AudioCaptureSession
    });
});
