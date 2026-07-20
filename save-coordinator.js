(function() {
    'use strict';

    if (window.QuoteDrSave) return;

    var DB_NAME = 'quotedr-durable-saves';
    var DB_VERSION = 1;
    var OUTBOX_STORE = 'outbox';
    var SNAPSHOT_STORE = 'snapshots';
    var META_STORE = 'meta';
    var RECOVERY_FUNCTION = '/functions/v1/save-recovery';
    var DEFAULT_TIMEOUT_MS = 15000;
    var SUCCESS_INDICATOR_MS = 3500;
    var MAX_BACKOFF_MS = 30 * 60 * 1000;
    var RECOVERY_GUIDANCE_ATTEMPTS = 3;
    var adapters = {};
    var listeners = [];
    var dbPromise = null;
    var flushPromise = null;
    var lastLocalFailure = null;
    var emergencyRecovery = null;
    var broadcast = null;
    var uiClickBound = false;
    var saveIndicatorHideTimer = null;
    var lastShownCloudAckAt = null;
    var rolloutEnabled = null;
    var recoveryGuidanceShown = {};

    function isEnabled() {
        if (window.QUOTEDR_DURABLE_SAVE_ENABLED === false) return false;
        if (window.QUOTEDR_DURABLE_SAVE_ENABLED === true) return true;
        try {
            if (localStorage.getItem('quotedr_durable_save_enabled') === 'false') return false;
            if (localStorage.getItem('quotedr_durable_save_enabled') === 'true') return true;
        } catch (e) {}
        return rolloutEnabled === true;
    }

    async function resolveRolloutEnabled() {
        if (window.QUOTEDR_DURABLE_SAVE_ENABLED === true || window.QUOTEDR_DURABLE_SAVE_ENABLED === false) return window.QUOTEDR_DURABLE_SAVE_ENABLED;
        try {
            var localOverride = localStorage.getItem('quotedr_durable_save_enabled');
            if (localOverride === 'true') return true;
            if (localOverride === 'false') return false;
        } catch (e) {}
        try {
            if (typeof _supabase === 'undefined' || !_supabase.auth) return false;
            var sessionResult = await _supabase.auth.getSession();
            var user = sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
            if (!user) return false;
            if (String(user.email || '').toLowerCase() === 'info@alddirect.ca') return true;
            var cachedRolloutKey = 'quotedr_durable_save_rollout_cached:' + user.id;
            var cachedRollout = null;
            try { cachedRollout = localStorage.getItem(cachedRolloutKey); } catch (e) {}
            var flagResult = await _supabase.from('user_data').select('value').eq('user_id', user.id).eq('key', 'durable_save_rollout').maybeSingle();
            if (flagResult.error) return cachedRollout === 'true';
            if (!flagResult.data) return false;
            var value = flagResult.data.value;
            var enabled = value === true || value === 'enabled' || (value && value.enabled === true);
            try { localStorage.setItem(cachedRolloutKey, String(enabled)); } catch (e) {}
            return enabled;
        } catch (e) {
            return false;
        }
    }

    function randomId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return 'qd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
    }

    function cloneValue(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function safeJson(value) {
        var seen = [];
        return JSON.stringify(value, function(key, current) {
            if (current instanceof Blob) return { _quotedrBlob: true, type: current.type, size: current.size };
            if (current && typeof current === 'object') {
                if (seen.indexOf(current) !== -1) return '[Circular]';
                seen.push(current);
            }
            return current;
        });
    }

    function fallbackHash(text) {
        var hash = 2166136261;
        for (var i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }

    async function payloadHash(value) {
        var text = safeJson(value);
        if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
            try {
                var digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
                return Array.from(new Uint8Array(digest)).map(function(byte) {
                    return byte.toString(16).padStart(2, '0');
                }).join('');
            } catch (e) {}
        }
        return fallbackHash(text);
    }

    function requestPromise(request) {
        return new Promise(function(resolve, reject) {
            request.onsuccess = function() { resolve(request.result); };
            request.onerror = function() { reject(request.error || new Error('IndexedDB request failed')); };
        });
    }

    function openDatabase() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function(resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('This browser does not support durable local saves.'));
                return;
            }
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function() {
                var db = request.result;
                if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
                    var outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: 'key' });
                    outbox.createIndex('userId', 'userId', { unique: false });
                    outbox.createIndex('state', 'state', { unique: false });
                    outbox.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
                    var snapshots = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
                    snapshots.createIndex('userId', 'userId', { unique: false });
                    snapshots.createIndex('state', 'state', { unique: false });
                }
                if (!db.objectStoreNames.contains(META_STORE)) {
                    db.createObjectStore(META_STORE, { keyPath: 'key' });
                }
            };
            request.onsuccess = function() {
                var db = request.result;
                db.onversionchange = function() { db.close(); };
                resolve(db);
            };
            request.onerror = function() { reject(request.error || new Error('Could not open the durable save database.')); };
        });
        return dbPromise;
    }

    async function getStoreValue(storeName, key) {
        var db = await openDatabase();
        var tx = db.transaction(storeName, 'readonly');
        return requestPromise(tx.objectStore(storeName).get(key));
    }

    async function getAllStoreValues(storeName) {
        var db = await openDatabase();
        var tx = db.transaction(storeName, 'readonly');
        return requestPromise(tx.objectStore(storeName).getAll());
    }

    async function putStoreValue(storeName, value) {
        var db = await openDatabase();
        var tx = db.transaction(storeName, 'readwrite');
        await requestPromise(tx.objectStore(storeName).put(value));
        return new Promise(function(resolve, reject) {
            tx.oncomplete = function() { resolve(value); };
            tx.onerror = function() { reject(tx.error || new Error('Durable save transaction failed')); };
            tx.onabort = function() { reject(tx.error || new Error('Durable save transaction was aborted')); };
        });
    }

    async function deleteStoreValue(storeName, key) {
        var db = await openDatabase();
        var tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        return new Promise(function(resolve, reject) {
            tx.oncomplete = resolve;
            tx.onerror = function() { reject(tx.error || new Error('Could not clear a durable save')); };
            tx.onabort = function() { reject(tx.error || new Error('Could not clear a durable save')); };
        });
    }

    async function persistOperationAndSnapshot(operation, snapshot) {
        var db = await openDatabase();
        var tx = db.transaction([OUTBOX_STORE, SNAPSHOT_STORE], 'readwrite');
        tx.objectStore(OUTBOX_STORE).put(operation);
        tx.objectStore(SNAPSHOT_STORE).put(snapshot);
        return new Promise(function(resolve, reject) {
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error || new Error('Could not save a durable local copy')); };
            tx.onabort = function() { reject(tx.error || new Error('Could not save a durable local copy')); };
        });
    }

    async function currentUserId(explicitOwner) {
        if (explicitOwner) return String(explicitOwner);
        try {
            if (typeof _supabase !== 'undefined' && _supabase.auth) {
                var result = await _supabase.auth.getSession();
                if (result && result.data && result.data.session && result.data.session.user) {
                    return result.data.session.user.id;
                }
            }
        } catch (e) {}
        return 'anonymous';
    }

    function entityKey(userId, entityType, entityId) {
        return [userId || 'anonymous', entityType || 'unknown', entityId || 'default'].join('::');
    }

    function errorObject(error) {
        if (!error) return { message: 'Cloud save failed without an error response.' };
        if (typeof error === 'string') return { message: error };
        return {
            message: String(error.message || error.error_description || error.details || error.hint || error),
            code: error.code || error.status || '',
            details: error.details || '',
            hint: error.hint || '',
            serverVersion: error.serverVersion || null
        };
    }

    function versionsMatch(left, right) {
        if (left === undefined || left === null || right === undefined || right === null) return false;
        if (String(left) === String(right)) return true;
        var leftTime = Date.parse(String(left));
        var rightTime = Date.parse(String(right));
        return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
    }

    function acknowledgedVersion(result, operation) {
        var data = result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
        var row = Array.isArray(data) ? data[0] : data;
        var column = operation && operation.target && operation.target.verifyVersionColumn || 'updated_at';
        return row && (row[column] || row.updated_at || row.updatedAt || row.version) ||
            operation && operation.target && operation.target.verifyVersionValue || null;
    }

    function operationClientEditedAt(payload, fallback) {
        payload = payload && typeof payload === 'object' ? payload : {};
        return payload._clientEditedAt || payload.clientEditedAt || payload.savedAt || fallback;
    }

    function operationEditorInstance(payload) {
        payload = payload && typeof payload === 'object' ? payload : {};
        return String(payload._editorInstanceId || '');
    }

    function operationPublishesPortalQuote(operation) {
        return !!(operation && operation.entityType === 'quote' && operation.payload &&
            operation.payload.portal_visible === true);
    }

    function isPortalLockedError(error) {
        return String(errorObject(error).code) === 'PORTAL_LOCKED';
    }

    function isConflictError(error) {
        var normalized = errorObject(error);
        return String(normalized.code) === '409' || /conflict|newer revision|stale write/i.test(normalized.message);
    }

    function isImmediateVaultError(error) {
        var normalized = errorObject(error);
        return /row.level security|permission denied|schema cache|column .* does not exist|invalid input|violates .* constraint|42501|PGRST/i.test(
            [normalized.code, normalized.message, normalized.details, normalized.hint].join(' ')
        );
    }

    function retryDelay(attempts) {
        var schedule = [5000, 15000, 60000, 5 * 60000, 15 * 60000, MAX_BACKOFF_MS];
        return schedule[Math.min(Math.max(attempts - 1, 0), schedule.length - 1)];
    }

    function withTimeout(promise, timeoutMs) {
        var timeoutId;
        return Promise.race([
            Promise.resolve(promise),
            new Promise(function(resolve, reject) {
                timeoutId = setTimeout(function() {
                    var error = new Error('Cloud save timed out');
                    error.code = 'QD_SAVE_TIMEOUT';
                    reject(error);
                }, timeoutMs || DEFAULT_TIMEOUT_MS);
            })
        ]).finally(function() { clearTimeout(timeoutId); });
    }

    function adapterFor(operation) {
        return adapters[operation.adapterType || operation.entityType] || adapters['*'] || null;
    }

    function normalizedAdapterResult(result, operation, adapter) {
        if (result && result.error) throw result.error;
        if (result === undefined || result === null) throw new Error('Cloud save returned no acknowledgement.');
        if (adapter && typeof adapter.verify === 'function' && !adapter.verify(result, operation)) {
            throw new Error('Cloud save acknowledgement did not match the saved revision.');
        }
        return result;
    }

    async function notify() {
        var status = await getStatus();
        updateIndicator(status);
        var guidance = document.getElementById('qdSaveGuidanceOverlay');
        if (guidance) {
            var guidanceKey = guidance.getAttribute('data-qd-operation-key');
            var stillPending = status.operations.some(function(operation) { return operation.key === guidanceKey; });
            if (!stillPending && !status.lastLocalFailure) guidance.remove();
        }
        listeners.slice().forEach(function(listener) {
            try { listener(status); } catch (e) {}
        });
        window.dispatchEvent(new CustomEvent('quotedr-save-state', { detail: status }));
        if (broadcast) {
            try { broadcast.postMessage({ type: 'state', status: status }); } catch (e) {}
        }
        return status;
    }

    function publicResult(state, operation, result, error) {
        var normalizedError = error ? errorObject(error) : null;
        return {
            state: state,
            saveState: state,
            operationId: operation && operation.operationId,
            revision: operation && operation.revision,
            data: result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result,
            error: normalizedError
        };
    }

    async function markAcknowledged(operation, result) {
        var cloudVersion = acknowledgedVersion(result, operation);
        var current = await getStoreValue(OUTBOX_STORE, operation.key);
        if (!current || current.operationId !== operation.operationId || current.revision !== operation.revision) {
            if (current && current.operationId === operation.operationId && current.revision !== operation.revision) {
                if (operationPublishesPortalQuote(operation)) {
                    var lockedSnapshot = await getStoreValue(SNAPSHOT_STORE, current.key) || {};
                    lockedSnapshot.state = 'portal_locked';
                    lockedSnapshot.cloudAckAt = new Date().toISOString();
                    lockedSnapshot.cloudResult = result && result.data ? result.data : null;
                    lockedSnapshot.cloudBaseVersion = cloudVersion || null;
                    lockedSnapshot.lastError = null;
                    await putStoreValue(SNAPSHOT_STORE, lockedSnapshot);
                    await deleteStoreValue(OUTBOX_STORE, current.key);
                    await putStoreValue(META_STORE, { key: 'lastCloudAckAt', value: lockedSnapshot.cloudAckAt });
                    clearRecoveryGuidance(current);
                    clearRecoveryGuidance(operation);
                    resolveVaultIncident(current).catch(function() {});
                    resolveVaultIncident(operation).catch(function() {});
                    window.dispatchEvent(new CustomEvent('quotedr-save-acknowledged', {
                        detail: { operation: operation, result: result, version: cloudVersion }
                    }));
                    await notify();
                    return publicResult('cloud_saved', operation, result, null);
                }
                current.baseVersion = cloudVersion || current.baseVersion || null;
                current.state = 'local_pending';
                current.attempts = 0;
                current.lastError = null;
                current.nextAttemptAt = 0;
                await putStoreValue(OUTBOX_STORE, current);
                var successorSnapshot = await getStoreValue(SNAPSHOT_STORE, current.key) || {};
                successorSnapshot.state = 'local_pending';
                successorSnapshot.lastError = null;
                successorSnapshot.cloudBaseVersion = current.baseVersion;
                await putStoreValue(SNAPSHOT_STORE, successorSnapshot);
                window.dispatchEvent(new CustomEvent('quotedr-save-acknowledged', {
                    detail: { operation: operation, result: result, version: cloudVersion }
                }));
                await notify();
                setTimeout(function() { flushSavedOperation(current, { force: true }); }, 0);
                return publicResult('local_pending', current, result, null);
            }
            return publicResult('cloud_saved', operation, result, null);
        }
        var snapshot = await getStoreValue(SNAPSHOT_STORE, operation.key) || {};
        snapshot.state = 'cloud_saved';
        snapshot.cloudAckAt = new Date().toISOString();
        snapshot.cloudResult = result && result.data ? result.data : null;
        snapshot.lastError = null;
        if (operation.action === 'delete') await deleteStoreValue(SNAPSHOT_STORE, operation.key);
        else await putStoreValue(SNAPSHOT_STORE, snapshot);
        await deleteStoreValue(OUTBOX_STORE, operation.key);
        await putStoreValue(META_STORE, { key: 'lastCloudAckAt', value: snapshot.cloudAckAt });
        clearRecoveryGuidance(operation);
        resolveVaultIncident(operation).catch(function() {});
        window.dispatchEvent(new CustomEvent('quotedr-save-acknowledged', {
            detail: { operation: operation, result: result, version: cloudVersion }
        }));
        await notify();
        return publicResult('cloud_saved', operation, result, null);
    }

    async function markSuperseded(operation, result) {
        var cloudVersion = result && result.cloudVersion || acknowledgedVersion(result, operation);
        var current = await getStoreValue(OUTBOX_STORE, operation.key);
        if (current && current.operationId === operation.operationId && current.revision !== operation.revision) {
            current.baseVersion = cloudVersion || current.baseVersion || null;
            current.forceConflictOverwrite = false;
            current.state = 'local_pending';
            current.attempts = 0;
            current.lastError = null;
            current.nextAttemptAt = 0;
            await putStoreValue(OUTBOX_STORE, current);
            var successorSnapshot = await getStoreValue(SNAPSHOT_STORE, current.key) || {};
            successorSnapshot.state = 'local_pending';
            successorSnapshot.lastError = null;
            successorSnapshot.cloudBaseVersion = current.baseVersion;
            await putStoreValue(SNAPSHOT_STORE, successorSnapshot);
            await notify();
            setTimeout(function() { flushSavedOperation(current, { force: true }); }, 0);
            return publicResult('local_pending', current, result, null);
        }
        if (current && current.operationId === operation.operationId && current.revision === operation.revision) {
            var snapshot = await getStoreValue(SNAPSHOT_STORE, operation.key) || {};
            snapshot.state = 'superseded_by_cloud';
            snapshot.supersededAt = new Date().toISOString();
            snapshot.cloudBaseVersion = cloudVersion || null;
            snapshot.cloudResult = result && result.data ? result.data : null;
            snapshot.lastError = null;
            await putStoreValue(SNAPSHOT_STORE, snapshot);
            await deleteStoreValue(OUTBOX_STORE, operation.key);
        }
        await putStoreValue(META_STORE, { key: 'lastCloudAckAt', value: new Date().toISOString() });
        clearRecoveryGuidance(operation);
        resolveVaultIncident(operation).catch(function() {});
        window.dispatchEvent(new CustomEvent('quotedr-save-superseded', {
            detail: { operation: operation, result: result, version: cloudVersion }
        }));
        await notify();
        return publicResult('superseded', operation, result, null);
    }

    async function markPending(operation, error) {
        var current = await getStoreValue(OUTBOX_STORE, operation.key);
        if (!current || current.revision !== operation.revision) return publicResult('local_pending', operation, null, error);
        current.attempts = (parseInt(current.attempts, 10) || 0) + 1;
        current.lastAttemptAt = new Date().toISOString();
        current.lastError = errorObject(error);
        current.state = isConflictError(error) ? 'conflict' : 'local_pending';
        current.nextAttemptAt = Date.now() + retryDelay(current.attempts);
        await putStoreValue(OUTBOX_STORE, current);
        var snapshot = await getStoreValue(SNAPSHOT_STORE, operation.key) || {};
        snapshot.state = current.state;
        snapshot.lastError = current.lastError;
        await putStoreValue(SNAPSHOT_STORE, snapshot);
        if (isImmediateVaultError(error) || current.attempts >= 3) captureVaultIncident(current).catch(function() {});
        await notify();
        if (current.entityType === 'quote' && current.attempts >= RECOVERY_GUIDANCE_ATTEMPTS) scheduleRecoveryGuidance(current, { localFailed: false });
        return publicResult(current.state, current, null, error);
    }

    async function markPortalLocked(operation, error) {
        var current = await getStoreValue(OUTBOX_STORE, operation.key);
        var snapshot = await getStoreValue(SNAPSHOT_STORE, operation.key) || {};
        snapshot.state = 'portal_locked';
        snapshot.cloudBaseVersion = error && error.serverVersion || null;
        snapshot.lastError = null;
        snapshot.supersededAt = new Date().toISOString();
        await putStoreValue(SNAPSHOT_STORE, snapshot);
        await deleteStoreValue(OUTBOX_STORE, operation.key);
        clearRecoveryGuidance(current || operation);
        resolveVaultIncident(current || operation).catch(function() {});
        window.dispatchEvent(new CustomEvent('quotedr-quote-portal-locked', {
            detail: {
                quoteData: operation.payload || null,
                row: {
                    id: operation.entityId || null,
                    updated_at: error && error.serverVersion || null,
                    data: { portal_visible: true }
                }
            }
        }));
        await notify();
        return publicResult('portal_locked', operation, null, error);
    }

    async function checkConflict(operation, adapter) {
        if (operation.forceConflictOverwrite === true) return null;
        // Quote writes perform their own edit-time comparison and atomic
        // compare-and-swap in the Supabase adapter.
        if (operation.entityType === 'quote') return null;
        if (!operation.baseVersion || !adapter || typeof adapter.readVersion !== 'function') return null;
        var serverVersion = await withTimeout(adapter.readVersion(operation), operation.timeoutMs);
        if (serverVersion && typeof serverVersion === 'object') {
            if (serverVersion.revision && serverVersion.revision === operation.revision) return null;
            if (serverVersion.operationId && serverVersion.operationId === operation.operationId) return null;
            serverVersion = serverVersion.version;
        }
        var expectedVersion = operation.target && operation.target.verifyVersionValue;
        if (!serverVersion || versionsMatch(serverVersion, operation.baseVersion) || versionsMatch(serverVersion, expectedVersion)) return null;
        var error = new Error('A newer revision already exists in the cloud. Review the conflict before overwriting it.');
        error.code = 'QD_SAVE_CONFLICT';
        error.serverVersion = serverVersion;
        return error;
    }

    async function flushOperation(operation, options) {
        options = options || {};
        var latest = await getStoreValue(OUTBOX_STORE, operation.key);
        if (!latest || latest.revision !== operation.revision) return publicResult('cloud_saved', operation, null, null);
        if (!options.force && latest.nextAttemptAt && latest.nextAttemptAt > Date.now()) {
            return publicResult(latest.state || 'local_pending', latest, null, latest.lastError);
        }
        if (navigator.onLine === false) return publicResult('local_pending', latest, null, { message: 'Offline' });
        var adapter = adapterFor(latest);
        if (!adapter || typeof adapter.write !== 'function') {
            return markPending(latest, new Error('The save adapter for ' + latest.entityType + ' is not loaded yet.'));
        }
        try {
            var conflict = await checkConflict(latest, adapter);
            if (conflict) return markPending(latest, conflict);
            var result = await withTimeout(adapter.write(cloneValue(latest)), latest.timeoutMs || DEFAULT_TIMEOUT_MS);
            if (result && result.superseded === true) return markSuperseded(latest, result);
            normalizedAdapterResult(result, latest, adapter);
            return markAcknowledged(latest, result);
        } catch (error) {
            if (isPortalLockedError(error) && latest.entityType === 'quote' && latest.target && latest.target.requireCurrentQuoteBase === true) {
                return markPortalLocked(latest, error);
            }
            return markPending(latest, error);
        }
    }

    async function flushSavedOperation(operation, options) {
        if (navigator.locks && typeof navigator.locks.request === 'function') {
            return navigator.locks.request('quotedr-durable-save-flush', { ifAvailable: true }, function(lock) {
                if (!lock) return publicResult('local_pending', operation, null, { message: 'Another QuoteDr tab is syncing this account.' });
                return flushOperation(operation, options);
            });
        }
        return flushOperation(operation, options);
    }

    async function runFlush(options) {
        options = options || {};
        var operations = await getAllStoreValues(OUTBOX_STORE);
        operations.sort(function(a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); });
        var results = [];
        for (var i = 0; i < operations.length; i++) {
            var operation = operations[i];
            if (operation.state === 'conflict') continue;
            results.push(await flushOperation(operation, options));
        }
        await notify();
        return results;
    }

    async function flush(options) {
        if (flushPromise) return flushPromise;
        var runner = function() { return runFlush(options); };
        flushPromise = (async function() {
            if (navigator.locks && typeof navigator.locks.request === 'function') {
                return navigator.locks.request('quotedr-durable-save-flush', { ifAvailable: true }, function(lock) {
                    if (!lock) return [];
                    return runner();
                });
            }
            return runner();
        })().finally(function() { flushPromise = null; });
        return flushPromise;
    }

    async function save(options) {
        options = options || {};
        if (!options.entityType) throw new Error('Durable saves require an entityType.');
        if (!options.entityId && options.entityId !== 0) throw new Error('Durable saves require an entityId.');
        var userId = await currentUserId(options.ownerId);
        var key = entityKey(userId, options.entityType, String(options.entityId));
        var now = new Date().toISOString();
        var existing = await getStoreValue(OUTBOX_STORE, key);
        var payload = cloneValue(options.payload);
        var incomingEditorInstance = operationEditorInstance(payload);
        var existingEditorInstance = operationEditorInstance(existing && existing.payload);
        var sameEditorChain = !!existing && (!incomingEditorInstance || !existingEditorInstance || incomingEditorInstance === existingEditorInstance);
        var holdExistingConflict = options.holdConflict === true && sameEditorChain && existing.state === 'conflict';
        var revision = randomId();
        var operation = {
            key: key,
            operationId: sameEditorChain ? existing.operationId : randomId(),
            revision: revision,
            payloadHash: await payloadHash(payload),
            userId: userId,
            entityType: options.entityType,
            entityId: String(options.entityId),
            entityLabel: options.entityLabel || '',
            adapterType: options.adapterType || options.entityType,
            action: options.action || 'upsert',
            payload: payload,
            target: options.target ? cloneValue(options.target) : null,
            baseVersion: sameEditorChain ? (existing.baseVersion || options.baseVersion || null) : (options.baseVersion || null),
            state: holdExistingConflict ? 'conflict' : 'local_pending',
            attempts: sameEditorChain ? existing.attempts || 0 : 0,
            createdAt: sameEditorChain ? existing.createdAt : now,
            localSavedAt: now,
            clientEditedAt: operationClientEditedAt(payload, now),
            lastAttemptAt: null,
            nextAttemptAt: 0,
            lastError: holdExistingConflict ? existing.lastError : null,
            timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
            page: window.location.pathname,
            appVersion: document.documentElement.getAttribute('data-app-version') || ''
        };
        if (operation.target && operation.target.verifyRevision && operation.target.values && operation.target.values.data && typeof operation.target.values.data === 'object') {
            operation.target.values.data._saveMeta = {
                operationId: operation.operationId,
                revision: operation.revision,
                payloadHash: operation.payloadHash,
                localSavedAt: operation.localSavedAt,
                clientEditedAt: operation.clientEditedAt,
                sourceInstanceId: payload && payload._editorInstanceId || ''
            };
        }
        if (!isEnabled()) {
            var disabledAdapter = adapterFor(operation);
            if (!disabledAdapter) return publicResult('local_failed', operation, null, new Error('Durable save is disabled and no direct save adapter is available.'));
            try {
                var disabledResult = await withTimeout(disabledAdapter.write(cloneValue(operation)), operation.timeoutMs);
                normalizedAdapterResult(disabledResult, operation, disabledAdapter);
                return publicResult('cloud_saved', operation, disabledResult, null);
            } catch (disabledError) {
                return publicResult('local_failed', operation, null, disabledError);
            }
        }
        var snapshotPayload = options.snapshotPayload === undefined ? payload : cloneValue(options.snapshotPayload);
        var snapshot = {
            key: key,
            userId: userId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            entityLabel: operation.entityLabel,
            revision: revision,
            payloadHash: operation.payloadHash,
            payload: snapshotPayload,
            state: options.action === 'delete' ? 'delete_pending' : operation.state,
            localSavedAt: now,
            clientEditedAt: operation.clientEditedAt,
            cloudAckAt: null,
            lastError: operation.lastError
        };
        try {
            await persistOperationAndSnapshot(operation, snapshot);
            if (!emergencyRecovery || emergencyRecovery.operation.key === operation.key) {
                lastLocalFailure = null;
                emergencyRecovery = null;
            }
        } catch (error) {
            lastLocalFailure = errorObject(error);
            lastLocalFailure.hasEmergencyRecovery = true;
            emergencyRecovery = { operation: operation, error: lastLocalFailure };
            await notify().catch(function() {});
            scheduleRecoveryGuidance(operation, { localFailed: true });
            return publicResult('local_failed', operation, null, error);
        }
        await notify();
        if (holdExistingConflict) return publicResult('conflict', operation, null, operation.lastError);
        if (options.background === true) {
            setTimeout(function() { flushSavedOperation(operation, { force: true }); }, 0);
            return publicResult('local_pending', operation, null, null);
        }
        return flushSavedOperation(operation, { force: true });
    }

    async function requireCloudAck(entityType, entityId) {
        var userId = await currentUserId();
        var key = entityKey(userId, entityType, String(entityId));
        var pending = await getStoreValue(OUTBOX_STORE, key);
        if (!pending) return true;
        if (pending.state === 'conflict') {
            openRecoveryCenter();
            return false;
        }
        var result = await flushSavedOperation(pending, { force: true });
        if (result.state === 'cloud_saved' || result.state === 'superseded') return true;
        openRecoveryCenter();
        return false;
    }

    async function getStatus() {
        var operations = [];
        try { operations = await getAllStoreValues(OUTBOX_STORE); } catch (e) {}
        var conflicts = operations.filter(function(item) { return item.state === 'conflict'; });
        var meta = null;
        try { meta = await getStoreValue(META_STORE, 'lastCloudAckAt'); } catch (e) {}
        return {
            state: lastLocalFailure ? 'local_failed' : (conflicts.length ? 'conflict' : (operations.length ? 'local_pending' : 'cloud_saved')),
            pendingCount: operations.length,
            conflictCount: conflicts.length,
            lastCloudAckAt: meta && meta.value ? meta.value : null,
            lastLocalFailure: lastLocalFailure,
            operations: operations
        };
    }

    async function getSnapshot(entityType, entityId, ownerId) {
        return getStoreValue(SNAPSHOT_STORE, entityKey(await currentUserId(ownerId), entityType, String(entityId)));
    }

    async function pauseEntity(entityType, entityId, options) {
        options = options || {};
        var key = entityKey(await currentUserId(options.ownerId), entityType, String(entityId));
        var operation = await getStoreValue(OUTBOX_STORE, key);
        if (!operation) return { state: 'missing' };
        operation.state = 'conflict';
        operation.nextAttemptAt = 0;
        operation.lastError = {
            message: options.message || 'This record was updated elsewhere while local changes were pending.',
            code: '409',
            details: '',
            hint: '',
            serverVersion: options.serverVersion || null
        };
        await putStoreValue(OUTBOX_STORE, operation);
        var snapshot = await getStoreValue(SNAPSHOT_STORE, key) || {};
        snapshot.state = 'conflict';
        snapshot.lastError = operation.lastError;
        await putStoreValue(SNAPSHOT_STORE, snapshot);
        await notify();
        return publicResult('conflict', operation, null, operation.lastError);
    }

    async function updateConflictPayload(entityType, entityId, payload, options) {
        options = options || {};
        var key = entityKey(await currentUserId(options.ownerId), entityType, String(entityId));
        var operation = await getStoreValue(OUTBOX_STORE, key);
        if (!operation || operation.state !== 'conflict') return { state: 'missing' };
        var now = new Date().toISOString();
        operation.payload = cloneValue(payload);
        operation.payloadHash = await payloadHash(operation.payload);
        operation.revision = randomId();
        operation.localSavedAt = now;
        operation.clientEditedAt = operationClientEditedAt(operation.payload, now);
        await putStoreValue(OUTBOX_STORE, operation);
        var snapshot = await getStoreValue(SNAPSHOT_STORE, key) || {};
        snapshot.revision = operation.revision;
        snapshot.payloadHash = operation.payloadHash;
        snapshot.payload = cloneValue(operation.payload);
        snapshot.state = 'conflict';
        snapshot.localSavedAt = now;
        snapshot.clientEditedAt = operation.clientEditedAt;
        snapshot.lastError = operation.lastError;
        await putStoreValue(SNAPSHOT_STORE, snapshot);
        await notify();
        return publicResult('conflict', operation, null, operation.lastError);
    }

    async function discardPending(entityType, entityId, options) {
        options = options || {};
        var key = entityKey(await currentUserId(options.ownerId), entityType, String(entityId));
        var operation = await getStoreValue(OUTBOX_STORE, key);
        var snapshot = await getStoreValue(SNAPSHOT_STORE, key) || null;
        if (snapshot) {
            snapshot.state = options.state || 'superseded_by_cloud';
            snapshot.supersededAt = new Date().toISOString();
            snapshot.lastError = null;
            await putStoreValue(SNAPSHOT_STORE, snapshot);
        }
        await deleteStoreValue(OUTBOX_STORE, key);
        if (operation) {
            clearRecoveryGuidance(operation);
            resolveVaultIncident(operation).catch(function() {});
        }
        await notify();
        return { state: operation || snapshot ? 'discarded' : 'missing' };
    }

    async function resolveConflict(key, strategy) {
        var operation = await getStoreValue(OUTBOX_STORE, key);
        if (!operation || operation.state !== 'conflict') return { state: 'missing' };
        if (strategy === 'use_local') {
            if (operation.entityType === 'quote') {
                var serverVersion = operation.lastError && operation.lastError.serverVersion || null;
                var quoteAdapter = adapterFor(operation);
                if (!serverVersion && quoteAdapter && typeof quoteAdapter.readVersion === 'function') {
                    var versionResult = await withTimeout(quoteAdapter.readVersion(operation), operation.timeoutMs);
                    serverVersion = versionResult && typeof versionResult === 'object' ? versionResult.version : versionResult;
                }
                if (!serverVersion || typeof saveQuoteToSupabase !== 'function') {
                    return { state: 'conflict', error: { message: 'The current cloud version could not be confirmed. Load the cloud copy or export this backup.' } };
                }
                var quotePayload = cloneValue(operation.payload || {});
                quotePayload._serverUpdatedAt = serverVersion;
                quotePayload._clientEditedAt = new Date().toISOString();
                quotePayload._remoteUpdatePending = false;
                var retainedSnapshot = await getStoreValue(SNAPSHOT_STORE, key) || {};
                retainedSnapshot.state = 'explicit_overwrite_selected';
                retainedSnapshot.lastError = null;
                await putStoreValue(SNAPSHOT_STORE, retainedSnapshot);
                await deleteStoreValue(OUTBOX_STORE, key);
                await notify();
                var localResult = await saveQuoteToSupabase(quotePayload);
                if (localResult && localResult.state === 'cloud_saved') {
                    window.dispatchEvent(new CustomEvent('quotedr-quote-conflict-resolved', {
                        detail: { strategy: 'use_local', entityId: operation.entityId, result: localResult }
                    }));
                }
                return localResult;
            }
            operation.baseVersion = operation.lastError && operation.lastError.serverVersion || operation.baseVersion || null;
            operation.forceConflictOverwrite = true;
            operation.state = 'local_pending';
            operation.attempts = 0;
            operation.lastError = null;
            operation.nextAttemptAt = 0;
            await putStoreValue(OUTBOX_STORE, operation);
            await notify();
            return flushSavedOperation(operation, { force: true });
        }
        if (strategy === 'use_cloud') {
            var snapshot = await getStoreValue(SNAPSHOT_STORE, key) || {};
            snapshot.state = 'superseded_by_cloud';
            snapshot.supersededAt = new Date().toISOString();
            snapshot.lastError = null;
            await putStoreValue(SNAPSHOT_STORE, snapshot);
            await deleteStoreValue(OUTBOX_STORE, key);
            resolveVaultIncident(operation).catch(function() {});
            await notify();
            if (operation.entityType === 'quote' && operation.entityId && operation.entityId.indexOf('quote-number:') !== 0) {
                var url = new URL(window.location.href);
                url.searchParams.set('load', operation.entityId);
                window.location.replace(url.toString());
            } else {
                window.location.reload();
            }
            return { state: 'cloud_selected' };
        }
        return { state: 'unchanged' };
    }

    function registerAdapter(entityType, adapter) {
        if (!entityType || !adapter || typeof adapter.write !== 'function') throw new Error('Invalid durable save adapter.');
        adapters[entityType] = adapter;
        if (isEnabled()) setTimeout(function() { flush(); }, 0);
        return function() { delete adapters[entityType]; };
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return function() {};
        listeners.push(listener);
        getStatus().then(listener).catch(function() {});
        return function() {
            var index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
        };
    }

    function recoveryUrl() {
        try {
            if (typeof SUPABASE_URL !== 'undefined') return SUPABASE_URL + RECOVERY_FUNCTION;
        } catch (e) {}
        return 'https://axmoffknvblluibuitrq.supabase.co' + RECOVERY_FUNCTION;
    }

    function redactSensitive(value) {
        var blocked = /token|secret|password|authorization|stripe.*key|quickbooks.*token|access[_-]?key/i;
        if (Array.isArray(value)) return value.map(redactSensitive);
        if (!value || typeof value !== 'object') return value;
        if (value instanceof Blob) return { _quotedrBlob: true, type: value.type, size: value.size };
        var clean = {};
        Object.keys(value).forEach(function(key) {
            clean[key] = blocked.test(key) ? '[REDACTED]' : redactSensitive(value[key]);
        });
        return clean;
    }

    async function recoveryHeaders() {
        if (typeof getSupabaseFunctionAuthHeaders === 'function') return getSupabaseFunctionAuthHeaders();
        if (typeof _supabase !== 'undefined') {
            var result = await _supabase.auth.getSession();
            var token = result && result.data && result.data.session && result.data.session.access_token;
            if (token) return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
        }
        throw new Error('No authenticated recovery session is available.');
    }

    async function callRecoveryFunction(body) {
        var response = await fetch(recoveryUrl(), {
            method: 'POST',
            headers: await recoveryHeaders(),
            body: JSON.stringify(body)
        });
        var data = await response.json().catch(function() { return {}; });
        if (!response.ok || data.error) throw new Error(data.error || 'Recovery service failed');
        return data;
    }

    async function captureVaultIncident(operation) {
        if (!operation || operation.userId === 'anonymous' || operation.vaultedAt) return;
        var adapter = adapterFor(operation);
        var payload = adapter && typeof adapter.redact === 'function'
            ? adapter.redact(cloneValue(operation.payload), operation)
            : redactSensitive(cloneValue(operation.payload));
        var request = {
            action: 'capture',
            operation: {
                operationId: operation.operationId,
                revision: operation.revision,
                payloadHash: operation.payloadHash,
                entityType: operation.entityType,
                entityId: operation.entityId,
                entityLabel: operation.entityLabel,
                saveAction: operation.action,
                payload: payload,
                target: redactSensitive(operation.target),
                attempts: operation.attempts,
                lastError: operation.lastError,
                localSavedAt: operation.localSavedAt,
                page: operation.page,
                appVersion: operation.appVersion
            }
        };
        if (JSON.stringify(request).length > 5 * 1024 * 1024) {
            request.operation.payload = { _tooLargeForVault: true, payloadHash: operation.payloadHash };
        }
        await callRecoveryFunction(request);
        var current = await getStoreValue(OUTBOX_STORE, operation.key);
        if (current && current.revision === operation.revision) {
            current.vaultedAt = new Date().toISOString();
            await putStoreValue(OUTBOX_STORE, current);
        }
    }

    async function resolveVaultIncident(operation) {
        if (!operation || !operation.vaultedAt) return;
        await callRecoveryFunction({ action: 'resolve', operationId: operation.operationId, revision: operation.revision });
    }

    function redactForExport(value) {
        var blocked = /token|secret|password|authorization|stripe.*key|quickbooks.*token|access[_-]?key/i;
        if (Array.isArray(value)) return value.map(redactForExport);
        if (!value || typeof value !== 'object' || value instanceof Blob) return value;
        var clean = {};
        Object.keys(value).forEach(function(key) {
            clean[key] = blocked.test(key) ? '[REDACTED]' : redactForExport(value[key]);
        });
        return clean;
    }

    async function recoverySerializable(value) {
        if (value instanceof Blob) {
            if (value.size > 50 * 1024 * 1024) {
                return { _quotedrBlob: true, type: value.type, size: value.size, _mustReselectOriginal: true };
            }
            var bytes = new Uint8Array(await value.arrayBuffer());
            var binary = '';
            var chunkSize = 32768;
            for (var offset = 0; offset < bytes.length; offset += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
            }
            return { _quotedrBlob: true, type: value.type, size: value.size, dataUrl: 'data:' + (value.type || 'application/octet-stream') + ';base64,' + btoa(binary) };
        }
        if (Array.isArray(value)) return Promise.all(value.map(recoverySerializable));
        if (!value || typeof value !== 'object') return value;
        var output = {};
        for (var key of Object.keys(value)) output[key] = await recoverySerializable(value[key]);
        return output;
    }

    async function exportRecovery() {
        var operations = [];
        try { operations = await getAllStoreValues(OUTBOX_STORE); } catch (e) {}
        if (emergencyRecovery && !operations.some(function(operation) { return operation.operationId === emergencyRecovery.operation.operationId; })) {
            operations.push(emergencyRecovery.operation);
        }
        var payload = {
            format: 'quotedr-recovery-v1',
            exportedAt: new Date().toISOString(),
            page: window.location.href,
            localStorageFailure: lastLocalFailure,
            operations: await Promise.all(operations.map(function(operation) {
                return recoverySerializable(redactForExport(operation));
            }))
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'QuoteDr Recovery - ' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function recoveryGuidanceKey(operation, localFailed) {
        return (localFailed ? 'local:' : 'cloud:') + String(operation && (operation.operationId || operation.key) || 'unknown');
    }

    function recoveryGuidanceStorageKey(operation) {
        return 'quotedr_recovery_guidance:' + String(operation && (operation.operationId || operation.key) || 'unknown');
    }

    function clearRecoveryGuidance(operation) {
        delete recoveryGuidanceShown[recoveryGuidanceKey(operation, false)];
        delete recoveryGuidanceShown[recoveryGuidanceKey(operation, true)];
        try { localStorage.removeItem(recoveryGuidanceStorageKey(operation)); } catch (e) {}
        var overlay = document.getElementById('qdSaveGuidanceOverlay');
        if (overlay && overlay.getAttribute('data-qd-operation-key') === String(operation && operation.key || '')) overlay.remove();
    }

    function scheduleRecoveryGuidance(operation, options) {
        options = options || {};
        if (!operation || operation.entityType !== 'quote') return;
        var localFailed = options.localFailed === true;
        if (!localFailed && (parseInt(operation.attempts, 10) || 0) < RECOVERY_GUIDANCE_ATTEMPTS) return;
        var key = recoveryGuidanceKey(operation, localFailed);
        if (recoveryGuidanceShown[key]) return;
        if (!localFailed) {
            try {
                if (localStorage.getItem(recoveryGuidanceStorageKey(operation)) === 'shown') return;
                localStorage.setItem(recoveryGuidanceStorageKey(operation), 'shown');
            } catch (e) {}
        }
        recoveryGuidanceShown[key] = true;
        setTimeout(function() { openRecoveryGuidance(operation, { localFailed: localFailed }).catch(function() {}); }, 0);
    }

    async function exportQuoteOperation(operation) {
        if (operation && operation.entityType === 'quote' && typeof window.qdExportQuoteRecovery === 'function') {
            var exported = await window.qdExportQuoteRecovery(cloneValue(operation));
            if (exported !== false) return true;
        }
        await exportRecovery();
        return false;
    }

    async function retryEmergencyRecovery() {
        if (!emergencyRecovery || !emergencyRecovery.operation) return null;
        var operation = emergencyRecovery.operation;
        operation.state = operation.action === 'delete' ? 'delete_pending' : 'local_pending';
        operation.nextAttemptAt = 0;
        operation.lastError = null;
        var snapshot = {
            key: operation.key,
            userId: operation.userId,
            entityType: operation.entityType,
            entityId: operation.entityId,
            entityLabel: operation.entityLabel,
            revision: operation.revision,
            payloadHash: operation.payloadHash,
            payload: cloneValue(operation.payload),
            state: operation.state,
            localSavedAt: operation.localSavedAt,
            cloudAckAt: null,
            lastError: null
        };
        try {
            await persistOperationAndSnapshot(operation, snapshot);
            lastLocalFailure = null;
            emergencyRecovery = null;
            await notify();
            return publicResult('local_pending', operation, null, null);
        } catch (error) {
            lastLocalFailure = errorObject(error);
            lastLocalFailure.hasEmergencyRecovery = true;
            emergencyRecovery = { operation: operation, error: lastLocalFailure };
            await notify().catch(function() {});
            return publicResult('local_failed', operation, null, error);
        }
    }

    async function retryPendingSaves() {
        var operation = emergencyRecovery && emergencyRecovery.operation;
        try {
            var emergencyResult = await retryEmergencyRecovery();
            var results = await flush({ force: true });
            if (emergencyResult) results.unshift(emergencyResult);
            return results;
        } catch (error) {
            lastLocalFailure = errorObject(error);
            if (operation) {
                lastLocalFailure.hasEmergencyRecovery = true;
                emergencyRecovery = { operation: operation, error: lastLocalFailure };
            }
            await notify().catch(function() {});
            return [publicResult('local_failed', operation, null, error)];
        }
    }

    async function openRecoveryGuidance(operation, options) {
        options = options || {};
        var localFailed = options.localFailed === true;
        if (!localFailed) {
            var current = await getStoreValue(OUTBOX_STORE, operation.key);
            if (!current || current.operationId !== operation.operationId) return;
            operation = current;
        }
        if (!document.body || document.getElementById('qdSaveGuidanceOverlay')) return;
        ensureUi();
        var quoteLabel = operation.entityLabel || 'This quote';
        var title = localFailed ? 'Back Up This Quote Now' : 'Cloud Save Needs Attention';
        var message = localFailed
            ? 'QuoteDr could not safely retain the latest change in this browser. Export a quote backup before leaving this page.'
            : 'QuoteDr has not been able to confirm this quote in the cloud after several attempts. Your latest changes remain saved on this device.';
        var overlay = document.createElement('div');
        overlay.id = 'qdSaveGuidanceOverlay';
        overlay.setAttribute('data-qd-operation-key', operation.key || '');
        overlay.innerHTML = '<div id="qdSaveGuidanceDialog" role="dialog" aria-modal="true" aria-labelledby="qdSaveGuidanceTitle">' +
            '<div class="qd-recovery-header"><div><div class="h5 mb-0" id="qdSaveGuidanceTitle"><i class="fas fa-cloud-arrow-up me-2"></i>' + escapeHtml(title) + '</div><div class="small text-muted mt-1">' + escapeHtml(quoteLabel) + '</div></div><button type="button" class="btn btn-sm btn-outline-secondary" data-qd-guidance-close aria-label="Close"><i class="fas fa-xmark"></i></button></div>' +
            '<div class="qd-recovery-body"><p class="mb-2">' + escapeHtml(message) + '</p><p class="mb-0"><strong>For an extra copy:</strong> choose Export Quote Backup. You can reopen the downloaded <code>.qdr</code> file later from <strong>File &gt; Open &gt; Open Local File</strong>. These controls are also available from <strong>Save Status</strong> in the bottom-left corner.</p></div>' +
            '<div class="qd-recovery-footer"><button type="button" class="btn btn-outline-success btn-sm" data-qd-guidance-export><i class="fas fa-download me-1"></i>Export Quote Backup</button><button type="button" class="btn btn-primary btn-sm" data-qd-guidance-retry><i class="fas fa-rotate me-1"></i>Retry Now</button><button type="button" class="btn btn-outline-secondary btn-sm" data-qd-guidance-status>Open Save Status</button><button type="button" class="btn btn-secondary btn-sm" data-qd-guidance-close>Continue Editing</button></div>' +
            '</div>';
        overlay.addEventListener('click', function(event) {
            if (event.target === overlay || event.target.closest('[data-qd-guidance-close]')) overlay.remove();
        });
        overlay.querySelector('[data-qd-guidance-export]').addEventListener('click', async function(event) {
            var button = event.currentTarget;
            button.disabled = true;
            try {
                await exportQuoteOperation(operation);
                button.innerHTML = '<i class="fas fa-check me-1"></i>Backup Downloaded';
            } catch (error) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-triangle-exclamation me-1"></i>Export Failed - Try Again';
            }
        });
        overlay.querySelector('[data-qd-guidance-retry]').addEventListener('click', async function(event) {
            var button = event.currentTarget;
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Retrying';
            await retryPendingSaves();
            overlay.remove();
            var status = await getStatus();
            if (status.pendingCount || status.lastLocalFailure) openRecoveryCenter();
        });
        overlay.querySelector('[data-qd-guidance-status]').addEventListener('click', function() {
            overlay.remove();
            openRecoveryCenter();
        });
        document.body.appendChild(overlay);
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function ensureUi() {
        if (!isEnabled()) return;
        if (window.QUOTEDR_SAVE_UI === false || /(?:interactive-quote-viewer|invoice-viewer|client-portal)\.html$/i.test(window.location.pathname)) return;
        if (!document.body) return;
        if (!uiClickBound) {
            document.addEventListener('click', function(event) {
                if (event.target && event.target.closest && event.target.closest('#qdSaveSyncButton')) openRecoveryCenter();
            });
            uiClickBound = true;
        }
        var existingButton = document.getElementById('qdSaveSyncButton');
        if (existingButton) {
            if (!existingButton.getAttribute('onclick')) existingButton.setAttribute('onclick', 'window.QuoteDrSave && window.QuoteDrSave.openRecoveryCenter()');
            existingButton.onclick = openRecoveryCenter;
            return;
        }
        var style = document.createElement('style');
        style.id = 'qd-save-coordinator-style';
        style.textContent = '' +
            '#qdSaveSyncButton{position:fixed;left:14px;bottom:14px;z-index:1040;border:1px solid #9aa7b7;border-radius:8px;background:#fff;color:#233348;padding:7px 10px;box-shadow:0 2px 8px rgba(26,41,64,.18);font:600 12px/1.2 system-ui;display:flex;align-items:center;gap:7px;max-width:230px}' +
            '#qdSaveSyncButton.qd-sync-pending{border-color:#d18b23;color:#80520c;background:#fff8e8}' +
            '#qdSaveSyncButton.qd-sync-error{border-color:#dc3545;color:#a61e2d;background:#fff5f5}' +
            '#qdSaveRecoveryOverlay,#qdSaveGuidanceOverlay{position:fixed;inset:0;z-index:20050;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:18px}' +
            '#qdSaveRecoveryDialog,#qdSaveGuidanceDialog{width:min(720px,100%);max-height:min(760px,92vh);overflow:auto;background:#fff;border-radius:8px;box-shadow:0 16px 44px rgba(0,0,0,.28)}' +
            '.qd-recovery-header,.qd-recovery-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #d8dee8}' +
            '.qd-recovery-footer{border-top:1px solid #d8dee8;border-bottom:0;justify-content:flex-end;flex-wrap:wrap}' +
            '.qd-recovery-body{padding:14px 16px}.qd-recovery-row{padding:10px 0;border-bottom:1px solid #e5e9f0}.qd-recovery-row:last-child{border:0}' +
            '.qd-recovery-title{font-weight:700;color:#17283e}.qd-recovery-meta{font-size:12px;color:#667085;margin-top:3px}.qd-recovery-error{font-size:12px;color:#b42318;margin-top:4px;overflow-wrap:anywhere}' +
            '@media(max-width:600px){#qdSaveSyncButton{left:8px;bottom:72px;max-width:190px}#qdSaveRecoveryOverlay,#qdSaveGuidanceOverlay{padding:8px;align-items:flex-end}#qdSaveRecoveryDialog,#qdSaveGuidanceDialog{max-height:88vh}}';
        document.head.appendChild(style);
        var button = document.createElement('button');
        button.type = 'button';
        button.id = 'qdSaveSyncButton';
        button.title = 'Open Sync and Recovery';
        button.setAttribute('onclick', 'window.QuoteDrSave && window.QuoteDrSave.openRecoveryCenter()');
        button.innerHTML = '<i class="fas fa-cloud"></i><span>Checking save status...</span>';
        document.body.appendChild(button);
    }

    function updateIndicator(status) {
        ensureUi();
        var button = document.getElementById('qdSaveSyncButton');
        if (!button) return;
        var isCleanCloudSave = status.state === 'cloud_saved' && !status.pendingCount && !status.conflictCount && !status.lastLocalFailure;
        var cloudAckKey = String(status.lastCloudAckAt || 'no-cloud-ack');
        if (isCleanCloudSave && button.hidden && cloudAckKey === lastShownCloudAckAt) return;
        if (saveIndicatorHideTimer) {
            clearTimeout(saveIndicatorHideTimer);
            saveIndicatorHideTimer = null;
        }
        button.hidden = false;
        button.classList.remove('qd-sync-pending', 'qd-sync-error');
        var icon = 'fa-cloud-check';
        var text = 'All changes saved to cloud';
        if (status.state === 'local_failed') {
            button.classList.add('qd-sync-error');
            icon = 'fa-triangle-exclamation';
            text = 'Save needs attention';
        } else if (status.state === 'conflict') {
            button.classList.add('qd-sync-error');
            icon = 'fa-code-compare';
            text = status.conflictCount + ' save conflict' + (status.conflictCount === 1 ? '' : 's');
        } else if (status.pendingCount) {
            button.classList.add('qd-sync-pending');
            icon = 'fa-cloud-arrow-up';
            text = 'Saved on this device - syncing';
        }
        button.innerHTML = '<i class="fas ' + icon + '"></i><span>' + text + '</span>';
        if (isCleanCloudSave) {
            lastShownCloudAckAt = cloudAckKey;
            saveIndicatorHideTimer = setTimeout(function() {
                var currentButton = document.getElementById('qdSaveSyncButton');
                if (currentButton) currentButton.hidden = true;
                saveIndicatorHideTimer = null;
            }, SUCCESS_INDICATOR_MS);
        }
    }

    async function openRecoveryCenter() {
        var old = document.getElementById('qdSaveRecoveryOverlay');
        if (old) old.remove();
        var status = await getStatus();
        var overlay = document.createElement('div');
        overlay.id = 'qdSaveRecoveryOverlay';
        var rows = status.operations.length ? status.operations.map(function(operation) {
            var lastError = operation.lastError && operation.lastError.message ? operation.lastError.message : '';
            var conflictActions = operation.state === 'conflict' ? '<div class="qd-recovery-actions mt-2"><button type="button" class="btn btn-sm btn-primary" data-qd-use-local data-qd-operation-key="' + escapeHtml(operation.key) + '"><i class="fas fa-laptop me-1"></i>Use My Version</button>' +
                (operation.entityType === 'quote' ? '<button type="button" class="btn btn-sm btn-outline-primary" data-qd-use-cloud data-qd-operation-key="' + escapeHtml(operation.key) + '"><i class="fas fa-cloud-arrow-down me-1"></i>Load Cloud Copy</button>' : '') + '</div>' : '';
            var quoteExportAction = operation.entityType === 'quote' ? '<div class="qd-recovery-actions mt-2"><button type="button" class="btn btn-sm btn-outline-success" data-qd-export-quote data-qd-operation-key="' + escapeHtml(operation.key) + '"><i class="fas fa-download me-1"></i>Export Quote Backup</button></div>' : '';
            return '<div class="qd-recovery-row">' +
                '<div class="qd-recovery-title">' + escapeHtml(operation.entityLabel || operation.entityType) + '</div>' +
                '<div class="qd-recovery-meta">' + escapeHtml(operation.state || 'local_pending') + ' | Saved locally ' + escapeHtml(new Date(operation.localSavedAt).toLocaleString()) + ' | Attempts: ' + escapeHtml(operation.attempts || 0) + '</div>' +
                (lastError ? '<div class="qd-recovery-error">' + escapeHtml(lastError) + '</div>' : '') +
                conflictActions +
                quoteExportAction +
                '</div>';
        }).join('') : (status.lastLocalFailure
            ? '<div class="qd-recovery-row"><div class="qd-recovery-title text-danger">This change is not safely retained</div><div class="qd-recovery-error">' + escapeHtml(status.lastLocalFailure.message || 'Local browser storage failed.') + '</div><div class="qd-recovery-meta">Export a recovery file now. For a file larger than 50 MB, keep the original selected file available for re-upload.</div>' +
                (emergencyRecovery && emergencyRecovery.operation && emergencyRecovery.operation.entityType === 'quote' ? '<div class="qd-recovery-actions mt-2"><button type="button" class="btn btn-sm btn-outline-success" data-qd-export-quote data-qd-operation-key="' + escapeHtml(emergencyRecovery.operation.key) + '"><i class="fas fa-download me-1"></i>Export Quote Backup</button></div>' : '') + '</div>'
            : '<div class="text-muted py-3">There are no pending saves. Your latest changes are confirmed in the cloud.</div>');
        var exportDisabled = status.operations.length || status.lastLocalFailure ? '' : ' disabled title="There are no pending saves to export"';
        overlay.innerHTML = '<div id="qdSaveRecoveryDialog" role="dialog" aria-modal="true" aria-labelledby="qdSaveRecoveryTitle">' +
            '<div class="qd-recovery-header"><div><div class="h5 mb-0" id="qdSaveRecoveryTitle"><i class="fas fa-shield-halved me-2"></i>Sync &amp; Recovery</div><div class="small text-muted mt-1">Local copies remain here until the cloud confirms them.</div></div><button type="button" class="btn btn-sm btn-outline-secondary" data-qd-close aria-label="Close"><i class="fas fa-xmark"></i></button></div>' +
            '<div class="qd-recovery-body">' + rows + '</div>' +
            '<div class="qd-recovery-footer"><button type="button" class="btn btn-outline-secondary btn-sm" data-qd-export' + exportDisabled + '><i class="fas fa-download me-1"></i>Export Recovery Bundle</button><button type="button" class="btn btn-primary btn-sm" data-qd-retry><i class="fas fa-rotate me-1"></i>Retry Now</button><button type="button" class="btn btn-secondary btn-sm" data-qd-close>Close</button></div>' +
            '</div>';
        overlay.addEventListener('click', function(event) {
            if (event.target === overlay || event.target.closest('[data-qd-close]')) overlay.remove();
        });
        overlay.querySelectorAll('[data-qd-use-local]').forEach(function(button) {
            button.addEventListener('click', async function() {
                overlay.style.display = 'none';
                var confirmed = typeof qdConfirm === 'function' ? await qdConfirm('Replace the newer cloud copy with the retained version from this device? QuoteDr will verify that the cloud has not changed again before saving.', {
                    title: 'Use My Version?', okText: 'Use My Version', cancelText: 'Cancel', type: 'warning'
                }) : window.confirm('Use this version and replace the newer cloud copy?');
                if (!confirmed) {
                    overlay.style.display = '';
                    return;
                }
                button.disabled = true;
                var result = await resolveConflict(button.getAttribute('data-qd-operation-key'), 'use_local');
                overlay.remove();
                if (!result || result.state !== 'cloud_saved') openRecoveryCenter();
            });
        });
        overlay.querySelectorAll('[data-qd-use-cloud]').forEach(function(button) {
            button.addEventListener('click', async function() {
                overlay.style.display = 'none';
                var confirmed = typeof qdConfirm === 'function' ? await qdConfirm('Load the newest cloud copy and stop retrying this device\'s pending version? The local recovery snapshot will be retained.', {
                    title: 'Load Cloud Copy?', okText: 'Load Cloud Copy', cancelText: 'Cancel', type: 'warning'
                }) : window.confirm('Load the newest cloud copy?');
                if (!confirmed) {
                    overlay.style.display = '';
                    return;
                }
                button.disabled = true;
                await resolveConflict(button.getAttribute('data-qd-operation-key'), 'use_cloud');
            });
        });
        overlay.querySelectorAll('[data-qd-export-quote]').forEach(function(button) {
            button.addEventListener('click', async function() {
                var operationKey = button.getAttribute('data-qd-operation-key');
                var operation = status.operations.find(function(item) { return item.key === operationKey; });
                if (!operation && emergencyRecovery) operation = emergencyRecovery.operation;
                if (!operation) return;
                button.disabled = true;
                try {
                    await exportQuoteOperation(operation);
                    button.innerHTML = '<i class="fas fa-check me-1"></i>Backup Downloaded';
                } catch (error) {
                    button.disabled = false;
                    button.innerHTML = '<i class="fas fa-triangle-exclamation me-1"></i>Export Failed - Try Again';
                }
            });
        });
        overlay.querySelector('[data-qd-export]').addEventListener('click', async function(event) {
            var button = event.currentTarget;
            button.disabled = true;
            try {
                await exportRecovery();
                button.innerHTML = '<i class="fas fa-check me-1"></i>Bundle Downloaded';
            } catch (error) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-triangle-exclamation me-1"></i>Export Failed - Try Again';
            }
        });
        overlay.querySelector('[data-qd-retry]').addEventListener('click', async function(event) {
            var button = event.currentTarget;
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Retrying';
            await retryPendingSaves();
            overlay.remove();
            openRecoveryCenter();
        });
        document.body.appendChild(overlay);
    }

    async function migrateLegacySnapshots() {
        var migrated = await getStoreValue(META_STORE, 'legacyMigrationV1');
        if (migrated && migrated.value) return;
        var userId = await currentUserId();
        var legacy = [
            ['quote_draft', 'active', 'ald_autosave_draft'],
            ['quote_session', 'active', 'ald_session_quote'],
            ['item_database', 'account', 'ald_custom_items'],
            ['client_database', 'account', 'ald_clients'],
            ['template_database', 'account', 'ald_quote_templates'],
            ['terms_database', 'account', 'ald_custom_terms'],
            ['business_profile', 'account', 'ald_business_profile'],
            ['payment_settings', 'account', 'ald_payment_settings'],
            ['company_logo', 'account', 'ald_company_logo']
        ];
        for (var i = 0; i < legacy.length; i++) {
            var raw = null;
            try { raw = localStorage.getItem(legacy[i][2]); } catch (e) {}
            if (!raw) continue;
            var value = raw;
            try { value = JSON.parse(raw); } catch (e) {}
            var key = entityKey(userId, legacy[i][0], legacy[i][1]);
            if (await getStoreValue(SNAPSHOT_STORE, key)) continue;
            await putStoreValue(SNAPSHOT_STORE, {
                key: key,
                userId: userId,
                entityType: legacy[i][0],
                entityId: legacy[i][1],
                revision: randomId(),
                payloadHash: await payloadHash(value),
                payload: value,
                state: 'legacy_local',
                localSavedAt: new Date().toISOString(),
                cloudAckAt: null,
                lastError: null
            });
        }
        await putStoreValue(META_STORE, { key: 'legacyMigrationV1', value: new Date().toISOString() });
    }

    async function requestPersistentStorage() {
        if (!navigator.storage || typeof navigator.storage.persist !== 'function') return;
        var asked = await getStoreValue(META_STORE, 'persistentStorageAsked');
        if (asked) return;
        try {
            var granted = await navigator.storage.persist();
            await putStoreValue(META_STORE, { key: 'persistentStorageAsked', value: true, granted: granted === true });
        } catch (e) {}
    }

    async function initialize() {
        rolloutEnabled = await resolveRolloutEnabled();
        window.dispatchEvent(new CustomEvent('quotedr-save-ready', { detail: { enabled: isEnabled() } }));
        if (!isEnabled()) return;
        ensureUi();
        try {
            await openDatabase();
            await migrateLegacySnapshots();
            if (typeof window.qdRegisterAllDurableSaveAdapters === 'function') window.qdRegisterAllDurableSaveAdapters();
            requestPersistentStorage();
            await notify();
            await flush({ force: true });
        } catch (error) {
            lastLocalFailure = errorObject(error);
            updateIndicator(await getStatus());
        }
        if (typeof BroadcastChannel === 'function') {
            broadcast = new BroadcastChannel('quotedr-durable-saves');
            broadcast.onmessage = function(event) {
                if (event.data && event.data.type === 'state') updateIndicator(event.data.status);
            };
        }
        window.addEventListener('online', function() { flush({ force: true }); });
        setInterval(ensureUi, 1000);
        setInterval(function() { flush(); }, 30000);
        try {
            if (typeof _supabase !== 'undefined' && _supabase.auth && _supabase.auth.onAuthStateChange) {
                _supabase.auth.onAuthStateChange(function(event) {
                    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') flush({ force: true });
                });
            }
        } catch (e) {}
    }

    window.QuoteDrSave = {
        registerAdapter: registerAdapter,
        save: save,
        flush: flush,
        requireCloudAck: requireCloudAck,
        subscribe: subscribe,
        getStatus: getStatus,
        getSnapshot: getSnapshot,
        pauseEntity: pauseEntity,
        updateConflictPayload: updateConflictPayload,
        discardPending: discardPending,
        resolveConflict: resolveConflict,
        exportRecovery: exportRecovery,
        openRecoveryCenter: openRecoveryCenter,
        captureIncident: captureVaultIncident,
        _openDatabase: openDatabase,
        _flushOperation: flushOperation,
        _entityKey: entityKey,
        _redactSensitive: redactSensitive,
        isEnabled: isEnabled
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
})();
