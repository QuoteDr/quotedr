// supabase.js - QuoteDr.io Supabase client and helpers

// Run this in Supabase SQL Editor:
// CREATE TABLE IF NOT EXISTS items (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id uuid REFERENCES auth.users(id),
//   data jsonb NOT NULL,
//   updated_at timestamptz DEFAULT now()
// );
// ALTER TABLE items ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users manage own items" ON items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

const SUPABASE_URL = 'https://axmoffknvblluibuitrq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';

// Initialize Supabase client
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window._supabase = _supabase;
window._supabaseClient = _supabase;

// Current user state
let currentUser = null;

// Check if user is authenticated
async function checkAuthStatus() {
    const { data: { session }, error } = await _supabase.auth.getSession();
    if (error) {
        console.error('Auth error:', error);
        return null;
    }
    if (session?.user) qdIdentifyAnalyticsUser(session.user);
    return session?.user || null;
}

// Get current user (cached)
async function getCurrentUser() {
    if (!currentUser) {
        currentUser = await checkAuthStatus();
    }
    return currentUser;
}

const QD_DURABLE_ENTITY_TYPES = [
    'quote', 'invoice', 'item_database', 'item', 'client', 'client_database', 'template', 'term',
    'business_profile', 'company_logo', 'payment_settings', 'notification_settings', 'quote_preferences',
    'quote_style', 'portal_theme', 'portal_job_folder', 'portal_job_asset', 'client_note', 'client_signature',
    'client_approval', 'labor_job_site', 'labor_session', 'labor_device', 'labor_location_event',
    'labor_notification_settings', 'user_data', 'upload_metadata', 'feedback', 'admin_broadcast', 'ai_mapping', 'ai_trade_rule'
];

function qdDurableSaveError(error, fallback) {
    if (!error) return new Error(fallback || 'Cloud save failed');
    if (error instanceof Error) return error;
    var wrapped = new Error(error.message || error.details || fallback || String(error));
    wrapped.code = error.code || error.status || '';
    wrapped.details = error.details || '';
    wrapped.hint = error.hint || '';
    return wrapped;
}

function qdApplyDurableFilters(query, filters) {
    (filters || []).forEach(function(filter) {
        if (!filter || !filter.column || filter.column === 'user_id') return;
        if (filter.operator === 'in') query = query.in(filter.column, Array.isArray(filter.value) ? filter.value : []);
        else if (filter.operator === 'is') query = query.is(filter.column, filter.value);
        else if (filter.operator === 'neq') query = query.neq(filter.column, filter.value);
        else query = query.eq(filter.column, filter.value);
    });
    return query;
}

async function qdExecuteDurableSupabaseTarget(operation) {
    var target = operation && operation.target;
    if (!target || !target.table || !target.action) throw new Error('Durable save target is incomplete.');
    var action = target.action;
    var values = target.values;
    var result;

    if (action === 'replace') {
        var replacementRows = Array.isArray(values) ? values : [];
        var matchColumn = target.matchColumn || 'id';
        var oldRowsResult = await _supabase.from(target.table).select('id,' + matchColumn).eq('user_id', operation.userId);
        if (oldRowsResult.error) throw qdDurableSaveError(oldRowsResult.error, 'Could not inspect records before replacement.');
        var replacementResult = { data: [], error: null };
        if (replacementRows.length) {
            replacementResult = await _supabase.from(target.table).upsert(replacementRows, target.onConflict ? { onConflict: target.onConflict } : undefined).select();
            if (replacementResult.error) throw qdDurableSaveError(replacementResult.error, 'Could not save replacement records.');
        }
        var keep = new Set(replacementRows.map(function(row) { return String(row[matchColumn] || ''); }));
        var staleIds = (oldRowsResult.data || []).filter(function(row) { return !keep.has(String(row[matchColumn] || '')); }).map(function(row) { return row.id; }).filter(Boolean);
        if (staleIds.length) {
            var deleteResult = await _supabase.from(target.table).delete().eq('user_id', operation.userId).in('id', staleIds);
            if (deleteResult.error) throw qdDurableSaveError(deleteResult.error, 'Could not finish replacing old records.');
        }
        return { data: replacementResult.data || [], error: null };
    }

    if (action === 'insert' && target.dedupe && target.dedupe.filters) {
        var existingQuery = _supabase.from(target.table).select(target.dedupe.select || 'id,updated_at').eq('user_id', operation.userId);
        existingQuery = qdApplyDurableFilters(existingQuery, target.dedupe.filters);
        var existingResult = await existingQuery.limit(1).maybeSingle();
        if (existingResult.error) throw qdDurableSaveError(existingResult.error, 'Could not verify an idempotent insert.');
        if (existingResult.data) {
            action = 'update';
            target.filters = [{ column: 'id', value: existingResult.data.id }];
        }
    }

    async function executeOnce(currentValues) {
        var query;
        if (action === 'upsert') {
            query = _supabase.from(target.table).upsert(currentValues, target.onConflict ? { onConflict: target.onConflict } : undefined);
        } else if (action === 'insert') {
            query = _supabase.from(target.table).insert(currentValues);
        } else if (action === 'update') {
            query = _supabase.from(target.table).update(currentValues);
            if (target.ownerScoped !== false) query = query.eq('user_id', operation.userId);
            query = qdApplyDurableFilters(query, target.filters);
        } else if (action === 'delete') {
            query = _supabase.from(target.table).delete();
            if (target.ownerScoped !== false) query = query.eq('user_id', operation.userId);
            query = qdApplyDurableFilters(query, target.filters);
        } else {
            throw new Error('Unsupported durable Supabase action: ' + action);
        }
        if (target.selectQuoteMetadata === true) query = query.select('id,user_id,status,type,quote_number,updated_at');
        else if (target.select !== false) query = query.select(target.select || '*');
        if (target.single === 'single') query = query.single();
        else if (target.single === 'maybeSingle') query = query.maybeSingle();
        return await query;
    }

    result = await executeOnce(values);
    if (result.error && target.fallbackStripColumns && /schema cache|column|type|parent_quote_id|change_order_number/i.test(result.error.message || '')) {
        var stripped = Array.isArray(values)
            ? values.map(function(row) { return Object.assign({}, row); })
            : Object.assign({}, values);
        target.fallbackStripColumns.forEach(function(column) {
            if (Array.isArray(stripped)) stripped.forEach(function(row) { delete row[column]; });
            else delete stripped[column];
        });
        result = await executeOnce(stripped);
    }
    if (result.error) throw qdDurableSaveError(result.error);
    if (target.expectRows !== false && target.select !== false && Array.isArray(result.data) && result.data.length === 0) {
        throw new Error('Cloud save matched no records. Your local copy is retained for retry.');
    }
    if (target.verifyRevision) {
        var acknowledged = Array.isArray(result.data) ? result.data[0] : result.data;
        var versionColumn = target.verifyVersionColumn || 'updated_at';
        var versionAcknowledged = target.verifyVersionValue !== undefined && target.verifyVersionValue !== null &&
            acknowledged && String(acknowledged[versionColumn] || '') === String(target.verifyVersionValue);
        var acknowledgedRevision = acknowledged && acknowledged.data && acknowledged.data._saveMeta && acknowledged.data._saveMeta.revision;
        if (!versionAcknowledged && (!acknowledgedRevision || acknowledgedRevision !== operation.revision)) {
            throw new Error('Cloud save acknowledgement did not match the local revision.');
        }
    }
    return { data: result.data, error: null };
}

async function qdReadDurableSupabaseVersion(operation) {
    var target = operation && operation.target;
    var version = target && target.versionRead;
    if (!version || !version.table || !version.filters) return null;
    var versionColumn = version.column || 'updated_at';
    var selectColumns = operation.target && operation.target.verifyRevision ? (versionColumn + ',data') : versionColumn;
    var query = _supabase.from(version.table).select(selectColumns).eq('user_id', operation.userId);
    query = qdApplyDurableFilters(query, version.filters);
    var result = await query.limit(1).maybeSingle();
    if (result.error) throw qdDurableSaveError(result.error, 'Could not verify the cloud revision.');
    if (!result.data) return null;
    if (operation.target && operation.target.verifyRevision) {
        return {
            version: result.data[versionColumn],
            revision: result.data.data && result.data.data._saveMeta && result.data.data._saveMeta.revision
        };
    }
    return result.data[versionColumn];
}

function qdRegisterDurableSaveAdapter(entityType) {
    if (!window.QuoteDrSave || !entityType) return false;
    if (!window._qdDurableRegisteredAdapters) window._qdDurableRegisteredAdapters = {};
    if (window._qdDurableRegisteredAdapters[entityType]) return true;
    window.QuoteDrSave.registerAdapter(entityType, {
        write: qdExecuteDurableSupabaseTarget,
        readVersion: qdReadDurableSupabaseVersion,
        verify: function(result) { return !!result && !result.error; }
    });
    window._qdDurableRegisteredAdapters[entityType] = true;
    return true;
}

function qdRegisterAllDurableSaveAdapters() {
    QD_DURABLE_ENTITY_TYPES.forEach(qdRegisterDurableSaveAdapter);
    qdRegisterSecureClientSaveAdapters();
}

async function qdDurableSupabaseOperation(options) {
    options = options || {};
    if (!options.entityType || !options.entityId || !options.target) throw new Error('Durable Supabase operation is incomplete.');
    if (window.QuoteDrSave) {
        qdRegisterDurableSaveAdapter(options.entityType);
        return window.QuoteDrSave.save({
            entityType: options.entityType,
            entityId: options.entityId,
            entityLabel: options.entityLabel || '',
            action: options.action || options.target.action || 'upsert',
            payload: options.payload,
            target: options.target,
            baseVersion: options.baseVersion || null,
            background: options.background === true,
            timeoutMs: options.timeoutMs || 15000
        });
    }
    try {
        var user = await getCurrentUser();
        var directOperation = {
            userId: user ? user.id : 'anonymous',
            entityType: options.entityType,
            entityId: String(options.entityId),
            target: options.target
        };
        var result = await qdExecuteDurableSupabaseTarget(directOperation);
        return { state: 'cloud_saved', saveState: 'cloud_saved', data: result.data, error: null };
    } catch (error) {
        return { state: 'local_failed', saveState: 'local_failed', data: null, error: qdDurableSaveError(error) };
    }
}

async function saveUserDataValue(key, value, options) {
    options = options || {};
    var user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    if (options.localStorageKey) {
        try {
            localStorage.setItem(options.localStorageKey, options.rawLocalValue === true ? String(value || '') : JSON.stringify(value));
        } catch (e) {}
    }
    return qdDurableSupabaseOperation({
        entityType: options.entityType || 'user_data',
        entityId: key,
        entityLabel: options.entityLabel || key.replace(/_/g, ' '),
        payload: value,
        target: {
            table: 'user_data',
            action: 'upsert',
            values: { user_id: user.id, key: key, value: value, updated_at: new Date().toISOString() },
            onConflict: 'user_id,key'
        },
        background: options.background === true
    });
}

window.qdRegisterAllDurableSaveAdapters = qdRegisterAllDurableSaveAdapters;
window.qdDurableSupabaseOperation = qdDurableSupabaseOperation;
window.saveUserDataValue = saveUserDataValue;

function qdExternalOperationStorageKey(action, entityId) {
    return 'quotedr_external_operation:' + String(action || 'action') + ':' + String(entityId || 'default');
}

function qdGetExternalOperationId(action, entityId) {
    var key = qdExternalOperationStorageKey(action, entityId);
    try {
        var existing = sessionStorage.getItem(key);
        if (existing) return existing;
        var value = window.crypto && typeof window.crypto.randomUUID === 'function'
            ? window.crypto.randomUUID()
            : 'qd-side-effect-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        sessionStorage.setItem(key, value);
        return value;
    } catch (e) {
        return 'qd-side-effect-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
}

function qdCompleteExternalOperation(action, entityId) {
    try { sessionStorage.removeItem(qdExternalOperationStorageKey(action, entityId)); } catch (e) {}
}

window.qdGetExternalOperationId = qdGetExternalOperationId;
window.qdCompleteExternalOperation = qdCompleteExternalOperation;

// Auth headers for Supabase Edge Functions that need the current signed-in user.
async function getSupabaseFunctionAuthHeaders() {
    const { data: { session }, error } = await _supabase.auth.getSession();
    if (error) throw error;
    if (!session?.access_token) throw new Error('Please sign in again before using this feature.');
    return {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + session.access_token
    };
}

const CLIENT_DOCUMENT_FUNCTION_URL = SUPABASE_URL + '/functions/v1/client-document';

function getSupabaseAnonFunctionHeaders() {
    return {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
    };
}

async function getSupabaseOptionalUserFunctionHeaders() {
    const headers = getSupabaseAnonFunctionHeaders();
    try {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
    } catch (e) {}
    return headers;
}

async function callClientDocumentFunction(body, requireUser) {
    const headers = requireUser ? await getSupabaseFunctionAuthHeaders() : getSupabaseAnonFunctionHeaders();
    const response = await fetch(CLIENT_DOCUMENT_FUNCTION_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body || {})
    });
    const data = await response.json().catch(function() { return {}; });
    if (!response.ok || data.error) throw new Error(data.error || 'Secure client document request failed');
    return data;
}

async function createSecureClientShareLink(documentId, baseUrl, options) {
    options = options || {};
    if (!documentId) throw new Error('Missing document id for secure client link');
    if (window.QuoteDrSave) {
        var quoteReady = await window.QuoteDrSave.requireCloudAck('quote', documentId);
        var invoiceReady = quoteReady ? await window.QuoteDrSave.requireCloudAck('invoice', documentId) : false;
        if (!quoteReady || !invoiceReady) throw new Error('This document is safely stored on this device but has not finished syncing to the cloud. Retry the pending save before sharing it.');
    }
    return callClientDocumentFunction({
        action: 'create_link',
        documentId: documentId,
        baseUrl: baseUrl || '',
        mode: options.mode || 'document'
    }, true);
}

async function loadSecureClientDocument(documentId, token, portalAnchorId) {
    if (!documentId || !token) return { error: 'Missing secure client link token' };
    try {
        const data = await callClientDocumentFunction({
            action: 'view',
            documentId: documentId,
            token: token,
            portalAnchorId: portalAnchorId || ''
        }, false);
        return { data: data.document };
    } catch (error) {
        return { error: error };
    }
}

async function updateSecureClientDocument(documentId, token, updateAction, payload, portalAnchorId) {
    if (!documentId || !token) return { error: 'Missing secure client link token' };
    var businessUpdate = updateAction === 'client_update' || updateAction === 'decline_change_order';
    if (businessUpdate && window.QuoteDrSave) {
        qdRegisterSecureClientSaveAdapters();
        var dataPatch = payload && payload.dataPatch || {};
        var signed = !!(dataPatch.signed_at || dataPatch.signature_url || dataPatch.signature_data_url || (payload && payload.topLevel && payload.topLevel.accepted_at));
        var entityType = signed ? 'client_signature' : (updateAction === 'decline_change_order' ? 'client_approval' : 'client_note');
        return window.QuoteDrSave.save({
            entityType: entityType,
            adapterType: 'secure_client_document',
            entityId: documentId + ':' + (signed ? 'signature' : updateAction),
            entityLabel: signed ? 'Client signature and approval' : (updateAction === 'decline_change_order' ? 'Client change order decision' : 'Client quote notes and selections'),
            ownerId: 'client-document:' + documentId,
            payload: {
                documentId: documentId,
                secureToken: token,
                updateAction: updateAction,
                updatePayload: payload || {},
                portalAnchorId: portalAnchorId || ''
            },
            action: 'update'
        });
    }
    return qdExecuteSecureClientDocumentUpdate({
        payload: {
            documentId: documentId,
            secureToken: token,
            updateAction: updateAction,
            updatePayload: payload || {},
            portalAnchorId: portalAnchorId || ''
        }
    });
}

async function qdExecuteSecureClientDocumentUpdate(operation) {
    var envelope = operation && operation.payload || {};
    try {
        const data = await fetch(CLIENT_DOCUMENT_FUNCTION_URL, {
            method: 'POST',
            headers: await getSupabaseOptionalUserFunctionHeaders(),
            body: JSON.stringify(Object.assign({
            action: 'update',
            updateAction: envelope.updateAction,
            documentId: envelope.documentId,
            token: envelope.secureToken,
            portalAnchorId: envelope.portalAnchorId || ''
            }, envelope.updatePayload || {}))
        }).then(async function(response) {
            const data = await response.json().catch(function() { return {}; });
            if (!response.ok || data.error) throw new Error(data.error || 'Secure client document request failed');
            return data;
        });
        return { data: data.document || data.result || null, unchanged: data.unchanged, status: data.status || '' };
    } catch (error) {
        return { error: error };
    }
}

function qdRegisterSecureClientSaveAdapters() {
    if (!window.QuoteDrSave) return;
    if (!window._qdSecureClientAdapterRegistered) {
        window.QuoteDrSave.registerAdapter('secure_client_document', {
            write: qdExecuteSecureClientDocumentUpdate,
            verify: function(result) { return !!result && !result.error; },
            redact: function(payload) {
                var clean = Object.assign({}, payload || {});
                delete clean.secureToken;
                return clean;
            }
        });
        window._qdSecureClientAdapterRegistered = true;
    }
}

async function logSecureClientDocumentEvent(documentId, token, eventType, payload, portalAnchorId) {
    payload = payload || {};
    if (!documentId || !token || !eventType) return { error: 'Missing secure activity details' };
    try {
        const response = await fetch(CLIENT_DOCUMENT_FUNCTION_URL, {
            method: 'POST',
            headers: payload.headers || getSupabaseAnonFunctionHeaders(),
            keepalive: payload.keepalive === true,
            body: JSON.stringify({
                action: 'log_event',
                documentId: documentId,
                token: token,
                portalAnchorId: portalAnchorId || '',
                eventType: eventType,
                sessionId: payload.sessionId || '',
                durationSeconds: payload.durationSeconds,
                metadata: payload.metadata || {}
            })
        });
        const data = await response.json().catch(function() { return {}; });
        if (!response.ok || data.error) throw new Error(data.error || 'Secure client activity request failed');
        return { data: data.event, skipped: data.skipped };
    } catch (error) {
        return { error: error };
    }
}

async function loadSecureClientDocumentActivity(documentId) {
    if (!documentId) return { error: 'Missing document id for activity log' };
    try {
        const data = await callClientDocumentFunction({
            action: 'document_activity',
            documentId: documentId
        }, true);
        return { data: data.events || [] };
    } catch (error) {
        return { error: error };
    }
}

async function loadSecureClientPortal(documentId, token) {
    if (!documentId || !token) return { error: 'Missing secure client portal token' };
    try {
        const data = await callClientDocumentFunction({
            action: 'portal',
            documentId: documentId,
            token: token
        }, false);
        return { data: data.documents || [], anchor: data.anchor || null };
    } catch (error) {
        return { error: error };
    }
}

const CLIENT_ACTIVITY_DEFAULT_PREFS = {
    email_on_viewed: true,
    email_on_accepted: true,
    email_on_declined: true,
    email_on_note: true,
    email_to: ''
};

function clientActivityDefaultPreferences() {
    return Object.assign({}, CLIENT_ACTIVITY_DEFAULT_PREFS);
}

async function loadClientNotificationPreferences() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    try {
        const { data, error } = await _supabase
            .from('client_notification_preferences')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
        if (error) throw error;
        return { data: Object.assign(clientActivityDefaultPreferences(), data || {}) };
    } catch (error) {
        return { error: error };
    }
}

async function saveClientNotificationPreferences(preferences) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const prefs = Object.assign(clientActivityDefaultPreferences(), preferences || {});
    const payload = {
        user_id: user.id,
        email_on_viewed: prefs.email_on_viewed === true,
        email_on_accepted: prefs.email_on_accepted !== false,
        email_on_declined: prefs.email_on_declined !== false,
        email_on_note: prefs.email_on_note !== false,
        email_to: String(prefs.email_to || '').trim(),
        updated_at: new Date().toISOString()
    };
    var result = await qdDurableSupabaseOperation({
        entityType: 'notification_settings',
        entityId: 'client-activity',
        entityLabel: 'Client activity notification settings',
        payload: prefs,
        target: {
            table: 'client_notification_preferences',
            action: 'upsert',
            values: payload,
            onConflict: 'user_id',
            single: 'maybeSingle'
        }
    });
    if (result.error) return result;
    return Object.assign({}, result, { data: Object.assign(clientActivityDefaultPreferences(), result.data || payload) });
}

async function loadClientActivityEvents(limit) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    try {
        const { data, error } = await _supabase
            .from('client_activity_events')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(Math.max(1, Math.min(parseInt(limit || 25, 10) || 25, 100)));
        if (error) throw error;
        return { data: data || [] };
    } catch (error) {
        return { error: error };
    }
}

async function markClientActivityEventsRead(ids, read) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const eventIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
    if (!eventIds.length) return { data: [] };
    return qdDurableSupabaseOperation({
        entityType: 'notification_settings',
        entityId: 'client-activity-read-' + eventIds.slice().sort().join(','),
        entityLabel: 'Client activity read status',
        action: 'update',
        payload: { ids: eventIds, read: read !== false },
        target: {
            table: 'client_activity_events',
            action: 'update',
            values: { read_at: read === false ? null : new Date().toISOString() },
            filters: [{ column: 'id', operator: 'in', value: eventIds }]
        }
    });
}

// Sign in with email and password
async function signInWithEmail(email, password) {
    const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    if (error) throw error;
    currentUser = data.user;
    qdIdentifyAnalyticsUser(currentUser);
    return data;
}

// Sign up with email and password
async function signUpWithEmail(email, password) {
    const { data, error } = await _supabase.auth.signUp({
        email: email,
        password: password
    });
    if (error) throw error;
    currentUser = data.user;
    qdIdentifyAnalyticsUser(currentUser);
    return data;
}

// Sign out
async function signOut() {
    const { error } = await _supabase.auth.signOut();
    if (error) console.error('Sign out error:', error);
    currentUser = null;
    if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.reset === 'function') window.QuoteDrAnalytics.reset();
    window.location.href = 'login.html';
}

// Get user's profile data
async function getUserProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    
    const { data, error } = await _supabase
        .from('user_data')
        .select('*')
        .eq('id', user.id)
        .single();
        
    if (error) {
        console.error('Profile fetch error:', error);
        return null;
    }
    return data;
}

// Update user's profile (legacy — kept for compatibility)
async function updateUserProfile(profileData) {
    // If called with onboarding_complete, route to the proper KV save
    if ('onboarding_complete' in profileData) {
        return saveOnboardingComplete(profileData.onboarding_complete);
    }
    return { error: 'updateUserProfile: unsupported fields' };
}

// Save onboarding complete flag to user_data key/value store
async function saveOnboardingComplete(value) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const result = await qdDurableSupabaseOperation({
        entityType: 'user_data',
        entityId: 'onboarding_complete',
        entityLabel: 'Onboarding status',
        payload: { complete: value },
        target: {
            table: 'user_data',
            action: 'upsert',
            values: { user_id: user.id, key: 'onboarding_complete', value: { complete: value }, updated_at: new Date().toISOString() },
            onConflict: 'user_id,key'
        }
    });
    if (!result.error) localStorage.setItem('ald_onboarding_complete', value ? '1' : '');
    return result;
}

// Load onboarding complete flag from user_data
async function loadOnboardingComplete() {
    const user = await getCurrentUser();
    if (!user) return false;
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'onboarding_complete')
        .maybeSingle();
    if (!error && data && data.value && data.value.complete) {
        localStorage.setItem('ald_onboarding_complete', '1');
        return true;
    }
    return false;
}

// Get all templates for current user
async function listTemplates() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Template list error:', error);
        return { error };
    }
    return { data };
}

// Save a template
async function saveTemplate(templateData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    var now = new Date().toISOString();
    return qdDurableSupabaseOperation({
        entityType: 'template',
        entityId: templateData.name || 'unnamed',
        entityLabel: templateData.name || 'Template',
        payload: templateData,
        target: {
            table: 'templates',
            action: 'upsert',
            values: { user_id: user.id, name: templateData.name || '', rooms: templateData.rooms || [], created_at: now, updated_at: now },
            onConflict: 'user_id,name'
        }
    });
}

// Delete a template
async function deleteTemplate(templateName) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    return qdDurableSupabaseOperation({
        entityType: 'template',
        entityId: templateName,
        entityLabel: templateName,
        action: 'delete',
        payload: { name: templateName },
        target: { table: 'templates', action: 'delete', values: {}, filters: [{ column: 'name', value: templateName }], expectRows: false }
    });
}

// Get all terms for current user
async function listTerms() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('terms')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Terms list error:', error);
        return { error };
    }
    return { data };
}

// Save a term
async function saveTerm(termData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    var now = new Date().toISOString();
    return qdDurableSupabaseOperation({
        entityType: 'term',
        entityId: termData.name || 'unnamed',
        entityLabel: termData.name || 'Quote term',
        payload: termData,
        target: {
            table: 'terms',
            action: 'upsert',
            values: { user_id: user.id, name: termData.name || '', text: termData.text || '', created_at: now, updated_at: now },
            onConflict: 'user_id,name'
        }
    });
}

// Delete a term
async function deleteTerm(termName) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    return qdDurableSupabaseOperation({
        entityType: 'term',
        entityId: termName,
        entityLabel: termName,
        action: 'delete',
        payload: { name: termName },
        target: { table: 'terms', action: 'delete', values: {}, filters: [{ column: 'name', value: termName }], expectRows: false }
    });
}

// Get all items for current user
async function listItems() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('items')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
        
    if (error) {
        console.error('Items list error:', error);
        return { error };
    }
    return { data };
}

// Save an item
async function saveItem(itemData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    var now = new Date().toISOString();
    return qdDurableSupabaseOperation({
        entityType: 'item',
        entityId: (itemData.category || '') + ':' + (itemData.name || 'unnamed'),
        entityLabel: itemData.name || 'Saved item',
        payload: itemData,
        target: {
            table: 'items',
            action: 'upsert',
            values: {
                user_id: user.id,
                name: itemData.name || '',
                category: itemData.category || '',
                unit_type: itemData.unitType || '',
                rate: itemData.rate || 0,
                material_cost: itemData.materialCost || 0,
                supplier_url: itemData.supplierUrl || '',
                created_at: now,
                updated_at: now
            },
            onConflict: 'user_id,name'
        }
    });
}

// Delete an item
async function deleteItem(itemName) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    return qdDurableSupabaseOperation({
        entityType: 'item',
        entityId: itemName,
        entityLabel: itemName,
        action: 'delete',
        payload: { name: itemName },
        target: { table: 'items', action: 'delete', values: {}, filters: [{ column: 'name', value: itemName }], expectRows: false }
    });
}

// Get all quotes for current user
async function listQuotes() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('quotes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Quotes list error:', error);
        return { error };
    }
    return { data };
}

// Compact rows for dashboards and quote pickers. Full quote JSON is fetched by id only when needed.
async function listQuoteSummaries() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const result = await _supabase.rpc('quotedr_list_quote_summaries');
    if (!result.error) {
        var summaryRows = result.data || [];
        if (summaryRows.length === 0) {
            const emptyFallback = await listQuotes();
            if (emptyFallback.error) return emptyFallback;
            var existingRows = (emptyFallback.data || []).filter(function(row) {
                return row.status !== 'backup' && row.quote_number !== '__ITEMS_BACKUP__';
            });
            if (existingRows.length > 0) {
                console.warn('Quote summary query returned no rows; using compatibility fallback.');
                return { data: existingRows };
            }
        }
        return {
            data: summaryRows.map(function(row) {
                row._summaryOnly = true;
                return row;
            })
        };
    }

    console.warn('Quote summary query failed; using compatibility fallback:', result.error.message || result.error);
    const fallback = await listQuotes();
    if (fallback.error) return fallback;
    return {
        data: (fallback.data || []).filter(function(row) {
            return row.status !== 'backup' && row.quote_number !== '__ITEMS_BACKUP__';
        })
    };
}

async function prepareQuoteMediaForCloudSave(quoteData) {
    if (!quoteData || !window.QuoteDrMedia || typeof QuoteDrMedia.prepareQuoteForCloud !== 'function') {
        return { data: quoteData, replacements: [], bytesRemoved: 0 };
    }
    if (typeof QuoteDrMedia.countEmbeddedPhotos === 'function' && QuoteDrMedia.countEmbeddedPhotos(quoteData) === 0) {
        return { data: quoteData, replacements: [], bytesRemoved: 0 };
    }
    return await QuoteDrMedia.prepareQuoteForCloud(quoteData);
}

async function quoteFullResolutionPhotosEnabledForSave() {
    try {
        return typeof hasFeature === 'function' ? await hasFeature('full_resolution_photos') : false;
    } catch (e) {
        return false;
    }
}

// Save a quote
async function saveQuote(quoteData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    try {
        await prepareQuoteMediaForCloudSave(quoteData);
    } catch (error) {
        console.error('Quote photo preparation error:', error);
        return { error: error };
    }

    const now = new Date().toISOString();
    if ((quoteData.type === 'change_order' || quoteData.documentType === 'change_order') &&
        quoteData.supabaseId &&
        quoteData.parentQuoteId &&
        quoteData.supabaseId === quoteData.parentQuoteId) {
        quoteData.supabaseId = null;
    }
    const clientEmail = quoteData.clientEmail || quoteData.email || '';
    const clientPhone = quoteData.clientPhone || quoteData.phone || '';
    const projectAddress = quoteData.projectAddress || '';
    const payload = {
        user_id: user.id,
        client_name: quoteData.clientName || '',
        quote_number: quoteData.quoteNumber || '',
        total: quoteData.grandTotal || 0,
        status: quoteData.status || 'draft',
        type: quoteData.type || quoteData.documentType || 'quote',
        parent_quote_id: quoteData.parentQuoteId || null,
        change_order_number: quoteData.changeOrderNumber || null,
        data: {
            type: quoteData.type || quoteData.documentType || 'quote',
            documentType: quoteData.type || quoteData.documentType || 'quote',
            parentQuoteId: quoteData.parentQuoteId || '',
            parentQuoteNumber: quoteData.parentQuoteNumber || '',
            parentQuoteTotal: quoteData.parentQuoteTotal || 0,
            changeOrderNumber: quoteData.changeOrderNumber || null,
            changeReason: quoteData.changeReason || '',
            status: quoteData.status || 'draft',
            quoteTitle: quoteData.quoteTitle || '',
            clientName: quoteData.clientName || '',
            quoteNumber: quoteData.quoteNumber || '',
            projectAddress: projectAddress,
            clientEmail: clientEmail,
            clientPhone: clientPhone,
            fullResolutionPhotosEnabled: await quoteFullResolutionPhotosEnabledForSave(),
            rooms: quoteData.rooms || [],
            terms: quoteData.terms || [],
            style: quoteData.style || {},
            notes: quoteData.notes || '',
            currency: quoteData.currency || 'CAD',
            quoteAdjustment: quoteData.quoteAdjustment || quoteData.clientAdjustment || null,
            paymentsReceived: quoteData.paymentsReceived || quoteData.paymentReceived || null,
            paymentSettings: quoteData.paymentSettings || null,
            businessProfile: quoteData.businessProfile || null,
            hiddenProfileFields: quoteData.hiddenProfileFields || [],
            paymentStatus: quoteData.paymentStatus || '',
            payments: quoteData.payments || [],
            portal_visible: quoteData.portal_visible === true,
            portal_id: quoteData.portal_id || '',
            portal_name: quoteData.portal_name || '',
            portal_client_name: quoteData.portal_client_name || quoteData.clientName || '',
            portal_client_email: quoteData.portal_client_email || quoteData.clientEmail || quoteData.email || '',
            portal_pin: quoteData.portal_pin || '',
            portal_added_at: quoteData.portal_added_at || null,
            portal_theme: quoteData.portal_theme || null,
            savedAt: quoteData.savedAt || now
        },
        updated_at: now
    };

    if (!quoteData.supabaseId && !quoteData.forceNew && !quoteData._forceNewQuote && quoteData.quoteNumber) {
        try {
            var existingResult = await _supabase
                .from('quotes')
                .select('id,data,type,quote_number,updated_at')
                .eq('user_id', user.id)
                .eq('quote_number', quoteData.quoteNumber)
                .order('updated_at', { ascending: false })
                .limit(1);
            var existingQuote = existingResult && existingResult.data && existingResult.data[0];
            if (existingQuote && existingQuote.id) {
                if (existingQuote.data && existingQuote.data.portal_visible === true && quoteData.portal_visible !== true) {
                    return {
                        error: {
                            message: 'This quote is already in a client portal and cannot be edited directly. Remove it from the portal in the dashboard before editing.'
                        }
                    };
                }
                quoteData.supabaseId = existingQuote.id;
            }
        } catch(e) {
            console.warn('Quote duplicate guard could not check quote number:', e);
        }
    }

    var isUpdate = !!quoteData.supabaseId;
    if (!isUpdate) payload.created_at = now;
    var entityId = quoteData.supabaseId || ('quote-number:' + (quoteData.quoteNumber || quoteData.clientName || 'draft'));
    var target = {
        table: 'quotes',
        action: isUpdate ? 'update' : 'insert',
        values: payload,
        filters: isUpdate ? [{ column: 'id', value: quoteData.supabaseId }] : [],
        dedupe: !isUpdate && quoteData.quoteNumber ? {
            filters: [{ column: 'quote_number', value: quoteData.quoteNumber }],
            select: 'id,updated_at'
        } : null,
        versionRead: isUpdate ? {
            table: 'quotes',
            column: 'updated_at',
            filters: [{ column: 'id', value: quoteData.supabaseId }]
        } : null,
        fallbackStripColumns: ['type', 'parent_quote_id', 'change_order_number'],
        verifyRevision: true,
        verifyVersionValue: payload.updated_at,
        selectQuoteMetadata: true
    };
    var durableResult = await qdDurableSupabaseOperation({
        entityType: 'quote',
        entityId: entityId,
        entityLabel: quoteData.quoteTitle || quoteData.clientName || quoteData.quoteNumber || 'Quote',
        action: isUpdate ? 'update' : 'insert',
        payload: quoteData,
        target: target,
        baseVersion: isUpdate ? (quoteData._serverUpdatedAt || quoteData.serverUpdatedAt || null) : null
    });
    if (durableResult.error) {
        console.error('Quote save deferred:', durableResult.error);
        return durableResult;
    }
    var data = durableResult.data;
    var savedQuote = Array.isArray(data) ? data[0] : data;
    var quoteKey = (savedQuote && savedQuote.id) || quoteData.supabaseId || quoteData.quoteNumber || now;
    var roomCount = Array.isArray(quoteData.rooms) ? quoteData.rooms.length : 0;
    var itemCount = Array.isArray(quoteData.rooms) ? quoteData.rooms.reduce(function(sum, room) { return sum + ((room.items || []).length); }, 0) : 0;
    var quoteProps = {
        quote_id: savedQuote && savedQuote.id,
        status: quoteData.status || 'draft',
        room_count: roomCount,
        item_count: itemCount,
        total_bucket: qdAnalyticsBucketMoney(quoteData.grandTotal || 0)
    };
    if (!quoteData.supabaseId) qdCaptureOnce('quote_started', quoteKey, quoteProps);
    if (roomCount > 0 && itemCount > 0 && (parseFloat(quoteData.grandTotal) || 0) > 0) {
        qdCaptureOnce('quote_completed', quoteKey, quoteProps);
    }
    return durableResult;
}

// Get all invoices for current user
async function listInvoices() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Invoices list error:', error);
        return { error };
    }
    return { data };
}

// Save an invoice for cross-device sharing (stored in quotes table)
function qdCanonicalInvoiceNumber(value) {
    var base = String(value || '').trim();
    if (!base) return 'INV';
    if (/(?:-INV)+$/i.test(base)) return base.replace(/(?:-INV)+$/i, '-INV');
    return base + '-INV';
}

async function saveInvoiceForSharing(invoiceData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    try {
        await prepareQuoteMediaForCloudSave(invoiceData);
    } catch (error) {
        console.error('Invoice photo preparation error:', error);
        return { error: error };
    }
    const now = new Date().toISOString();
    const invoiceQuoteNumber = qdCanonicalInvoiceNumber(invoiceData.quoteNumber || invoiceData.quote_number || '');
    const payload = {
        user_id: user.id,
        data: {
            ...invoiceData,
            quoteNumber: invoiceQuoteNumber,
            _type: 'invoice',
            type: invoiceData.type || 'invoice',
            documentType: 'invoice',
            portal_visible: invoiceData.portal_visible === true,
            portal_client_name: invoiceData.portal_client_name || invoiceData.clientName || '',
            portal_client_email: invoiceData.portal_client_email || invoiceData.email || invoiceData.clientEmail || '',
            portal_added_at: invoiceData.portal_added_at || null
        },
        client_name: invoiceData.clientName || '',
        quote_number: invoiceQuoteNumber,
        total: invoiceData.grandTotal || 0,
        status: 'invoiced',
        updated_at: now
    };
    var isUpdate = !!invoiceData.supabaseId;
    if (!isUpdate) payload.created_at = now;
    var result = await qdDurableSupabaseOperation({
        entityType: 'invoice',
        entityId: invoiceData.supabaseId || ('invoice-number:' + invoiceQuoteNumber),
        entityLabel: invoiceData.clientName ? ('Invoice for ' + invoiceData.clientName) : invoiceQuoteNumber,
        action: isUpdate ? 'update' : 'insert',
        payload: invoiceData,
        target: {
            table: 'quotes',
            action: isUpdate ? 'update' : 'insert',
            values: payload,
            filters: isUpdate ? [{ column: 'id', value: invoiceData.supabaseId }] : [],
            dedupe: !isUpdate ? { filters: [{ column: 'quote_number', value: invoiceQuoteNumber }], select: 'id,updated_at' } : null,
            versionRead: isUpdate ? { table: 'quotes', column: 'updated_at', filters: [{ column: 'id', value: invoiceData.supabaseId }] } : null,
            verifyRevision: true,
            verifyVersionValue: payload.updated_at,
            selectQuoteMetadata: true,
            single: 'single'
        },
        baseVersion: isUpdate ? (invoiceData._serverUpdatedAt || invoiceData.serverUpdatedAt || null) : null
    });
    var data = result.data;
    if (result.error) console.error('saveInvoiceForSharing deferred:', result.error);
    if (!result.error && data) {
        var savedInvoice = Array.isArray(data) ? data[0] : data;
        qdCaptureOnce('invoice_created', savedInvoice.id || invoiceData.supabaseId || invoiceData.id || now, {
            invoice_id: savedInvoice.id,
            total_bucket: qdAnalyticsBucketMoney(invoiceData.grandTotal || 0),
            room_count: Array.isArray(invoiceData.rooms) ? invoiceData.rooms.length : 0
        });
    }
    return result;
}

// Save client to Supabase
async function saveClientToSupabase(client) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    var values = {
            user_id: user.id,
            name: client.name || '',
            phone: client.phone || '',
            email: client.email || '',
            address: client.address || '',
            city: client.city || '',
            notes: client.notes || '',
            crm: client.crm || {},
            updated_at: new Date().toISOString()
        };
    return qdDurableSupabaseOperation({
        entityType: 'client',
        entityId: client.id || client.name || client.email || 'unnamed',
        entityLabel: client.name || client.email || 'Client',
        payload: client,
        target: { table: 'clients', action: 'upsert', values: values, onConflict: 'user_id,name' }
    });
}

// List clients from Supabase
async function listClientsFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
    return { data, error };
}

function qdLaborNumber(value, fallback) {
    var parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function qdLaborDurationMinutes(startedAt, endedAt, breakMinutes) {
    var start = new Date(startedAt);
    var end = new Date(endedAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
    var raw = Math.round((end.getTime() - start.getTime()) / 60000);
    return Math.max(0, raw - Math.max(0, parseInt(breakMinutes || 0, 10) || 0));
}

function qdNormalizeLaborJobSite(site, userId) {
    var now = new Date().toISOString();
    return {
        user_id: userId,
        quote_id: site.quote_id || site.quoteId || null,
        quote_number: site.quote_number || site.quoteNumber || '',
        client_name: site.client_name || site.clientName || '',
        name: site.name || site.client_name || site.clientName || 'Job Site',
        address: site.address || '',
        latitude: site.latitude == null || site.latitude === '' ? null : qdLaborNumber(site.latitude, null),
        longitude: site.longitude == null || site.longitude === '' ? null : qdLaborNumber(site.longitude, null),
        geofence_radius_m: Math.max(25, Math.min(1000, parseInt(site.geofence_radius_m || site.radius || 75, 10) || 75)),
        active: site.active !== false,
        notes: site.notes || '',
        updated_at: now
    };
}

function qdNormalizeLaborSession(session, userId) {
    var now = new Date().toISOString();
    var startedAt = session.started_at || session.startedAt;
    var endedAt = session.ended_at || session.endedAt || null;
    var breakMinutes = Math.max(0, parseInt(session.break_minutes || session.breakMinutes || 0, 10) || 0);
    return {
        user_id: userId,
        job_site_id: session.job_site_id || session.jobSiteId,
        quote_id: session.quote_id || session.quoteId || null,
        source: session.source || 'manual',
        status: session.status || 'pending_review',
        started_at: startedAt,
        ended_at: endedAt,
        duration_minutes: parseInt(session.duration_minutes || session.durationMinutes || qdLaborDurationMinutes(startedAt, endedAt, breakMinutes), 10) || 0,
        break_minutes: breakMinutes,
        worker_name: session.worker_name || session.workerName || '',
        notes: session.notes || '',
        raw_location: session.raw_location || session.rawLocation || {},
        review_notes: session.review_notes || session.reviewNotes || '',
        approved_at: session.approved_at || session.approvedAt || null,
        updated_at: now
    };
}

// Labour tracker: list job sites for current user
async function listLaborJobSites(options) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    options = options || {};
    var query = _supabase
        .from('labor_job_sites')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
    if (options.activeOnly !== false) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) console.error('Labor job sites list error:', error);
    return { data, error };
}

// Labour tracker: create or update a job site
async function saveLaborJobSite(site) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    var payload = qdNormalizeLaborJobSite(site || {}, user.id);
    if (site && site.id) payload.id = site.id;
    if (!payload.name || !payload.name.trim()) return { error: 'Job site name is required' };
    var isUpdate = !!(site && site.id);
    return qdDurableSupabaseOperation({
        entityType: 'labor_job_site',
        entityId: site.id || (payload.name + ':' + payload.address),
        entityLabel: payload.name,
        action: isUpdate ? 'update' : 'insert',
        payload: site,
        target: {
            table: 'labor_job_sites',
            action: isUpdate ? 'update' : 'insert',
            values: payload,
            filters: isUpdate ? [{ column: 'id', value: site.id }] : [],
            dedupe: isUpdate ? null : { filters: [{ column: 'name', value: payload.name }, { column: 'address', value: payload.address }], select: 'id,updated_at' }
        },
        baseVersion: isUpdate ? (site.updated_at || site.updatedAt || null) : null
    });
}

async function archiveLaborJobSite(siteId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    return qdDurableSupabaseOperation({
        entityType: 'labor_job_site',
        entityId: siteId,
        entityLabel: 'Archived job site',
        action: 'update',
        payload: { id: siteId, active: false },
        target: { table: 'labor_job_sites', action: 'update', values: { active: false, updated_at: new Date().toISOString() }, filters: [{ column: 'id', value: siteId }] }
    });
}

// Labour tracker: list sessions for review/reporting
async function listLaborSessions(options) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    options = options || {};
    var query = _supabase
        .from('labor_time_sessions')
        .select('*, labor_job_sites(name,address,client_name,quote_number)')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false });
    if (options.status) query = query.eq('status', options.status);
    if (options.jobSiteId) query = query.eq('job_site_id', options.jobSiteId);
    if (options.since) query = query.gte('started_at', options.since);
    if (options.until) query = query.lte('started_at', options.until);
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) console.error('Labor sessions list error:', error);
    return { data, error };
}

async function saveLaborSession(session) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    var payload = qdNormalizeLaborSession(session || {}, user.id);
    if (session && session.id) payload.id = session.id;
    if (!payload.job_site_id) return { error: 'Job site is required' };
    if (!payload.started_at || !payload.ended_at) return { error: 'Start and end times are required' };
    var isUpdate = !!(session && session.id);
    return qdDurableSupabaseOperation({
        entityType: 'labor_session',
        entityId: session.id || [payload.job_site_id, payload.started_at, payload.worker_name].join(':'),
        entityLabel: payload.worker_name ? ('Labour session - ' + payload.worker_name) : 'Labour session',
        action: isUpdate ? 'update' : 'insert',
        payload: session,
        target: {
            table: 'labor_time_sessions',
            action: isUpdate ? 'update' : 'insert',
            values: payload,
            filters: isUpdate ? [{ column: 'id', value: session.id }] : [],
            dedupe: isUpdate ? null : { filters: [{ column: 'job_site_id', value: payload.job_site_id }, { column: 'started_at', value: payload.started_at }], select: 'id,updated_at' }
        },
        baseVersion: isUpdate ? (session.updated_at || session.updatedAt || null) : null
    });
}

async function updateLaborSessionStatus(sessionId, status, reviewNotes) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    var payload = {
        status: status,
        review_notes: reviewNotes || '',
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
    };
    return qdDurableSupabaseOperation({
        entityType: 'labor_session',
        entityId: sessionId,
        entityLabel: 'Labour session review',
        action: 'update',
        payload: payload,
        target: { table: 'labor_time_sessions', action: 'update', values: payload, filters: [{ column: 'id', value: sessionId }] }
    });
}

async function listLaborDevices() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('labor_devices')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
    if (error) console.error('Labor devices list error:', error);
    return { data, error };
}

async function saveLaborDevice(device) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    var now = new Date().toISOString();
    var payload = {
        user_id: user.id,
        device_key: device.device_key || device.deviceKey,
        platform: device.platform || 'android',
        device_name: device.device_name || device.deviceName || '',
        push_token: device.push_token || device.pushToken || null,
        tracking_enabled: device.tracking_enabled === true || device.trackingEnabled === true,
        last_sync_at: device.last_sync_at || device.lastSyncAt || null,
        last_event_at: device.last_event_at || device.lastEventAt || null,
        last_error: device.last_error || device.lastError || null,
        app_version: device.app_version || device.appVersion || '',
        updated_at: now
    };
    if (!payload.device_key) return { error: 'Device key is required' };
    if (device.id) payload.id = device.id;
    return qdDurableSupabaseOperation({
        entityType: 'labor_device',
        entityId: payload.device_key,
        entityLabel: payload.device_name || payload.device_key,
        payload: device,
        target: { table: 'labor_devices', action: 'upsert', values: payload, onConflict: 'user_id,device_key' }
    });
}

async function listLaborLocationEvents(options) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    options = options || {};
    var query = _supabase
        .from('labor_location_events')
        .select('*, labor_job_sites(name,address,client_name,quote_number), labor_devices(device_name,platform)')
        .eq('user_id', user.id)
        .order('occurred_at', { ascending: false });
    if (options.since) query = query.gte('occurred_at', options.since);
    if (options.jobSiteId) query = query.eq('job_site_id', options.jobSiteId);
    if (options.eventType) query = query.eq('event_type', options.eventType);
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) console.error('Labor location events list error:', error);
    return { data, error };
}

async function saveLaborLocationEvent(event) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    var payload = {
        user_id: user.id,
        device_id: event.device_id || event.deviceId || null,
        device_key: event.device_key || event.deviceKey || '',
        job_site_id: event.job_site_id || event.jobSiteId || null,
        quote_id: event.quote_id || event.quoteId || null,
        event_type: event.event_type || event.eventType,
        transition_source: event.transition_source || event.transitionSource || 'web_debug',
        occurred_at: event.occurred_at || event.occurredAt || new Date().toISOString(),
        latitude: event.latitude == null || event.latitude === '' ? null : qdLaborNumber(event.latitude, null),
        longitude: event.longitude == null || event.longitude === '' ? null : qdLaborNumber(event.longitude, null),
        accuracy_m: event.accuracy_m == null || event.accuracy_m === '' ? null : qdLaborNumber(event.accuracy_m, null),
        raw_payload: event.raw_payload || event.rawPayload || {}
    };
    if (!payload.event_type) return { error: 'Event type is required' };
    return qdDurableSupabaseOperation({
        entityType: 'labor_location_event',
        entityId: [payload.device_key, payload.job_site_id, payload.event_type, payload.occurred_at].join(':'),
        entityLabel: 'Labour location event',
        payload: event,
        target: { table: 'labor_location_events', action: 'upsert', values: payload, onConflict: 'user_id,device_key,job_site_id,event_type,occurred_at' },
        background: true
    });
}

async function getLaborNotificationSettings() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('labor_notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
    if (error) console.error('Labor notification settings load error:', error);
    return {
        data: data || {
            user_id: user.id,
            enabled: true,
            morning_enabled: true,
            evening_enabled: true,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto',
            morning_time: '08:00',
            evening_time: '17:30'
        },
        error
    };
}

async function saveLaborNotificationSettings(settings) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    var now = new Date().toISOString();
    var payload = {
        user_id: user.id,
        enabled: settings.enabled !== false,
        morning_enabled: settings.morning_enabled !== false && settings.morningEnabled !== false,
        evening_enabled: settings.evening_enabled !== false && settings.eveningEnabled !== false,
        timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto',
        morning_time: settings.morning_time || settings.morningTime || '08:00',
        evening_time: settings.evening_time || settings.eveningTime || '17:30',
        last_opened_at: settings.last_opened_at || settings.lastOpenedAt || null,
        updated_at: now
    };
    return qdDurableSupabaseOperation({
        entityType: 'labor_notification_settings',
        entityId: 'account',
        entityLabel: 'Labour notification settings',
        payload: settings,
        target: { table: 'labor_notification_settings', action: 'upsert', values: payload, onConflict: 'user_id', single: 'single' }
    });
}

async function submitLaborDailyCheckin(checkin) {
    try {
        const response = await fetch(SUPABASE_URL + '/functions/v1/labor-checkin-submit', {
            method: 'POST',
            headers: await getSupabaseFunctionAuthHeaders(),
            body: JSON.stringify(checkin || {})
        });
        const data = await response.json();
        if (!response.ok || data.error) return { error: data.error || 'Labor check-in failed' };
        return { data };
    } catch (error) {
        console.error('Labor check-in submit error:', error);
        return { error: error.message || String(error) };
    }
}

async function listLaborProductionRates(options) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    options = options || {};
    var query = _supabase
        .from('labor_item_production_rates')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
    if (options.itemName) query = query.ilike('item_name', '%' + options.itemName + '%');
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) console.error('Labor production rates list error:', error);
    return { data, error };
}

// Aliases for consistent naming
var listQuotesFromSupabase = listQuotes;
var listQuoteSummariesFromSupabase = listQuoteSummaries;
var listInvoicesFromSupabase = listInvoices;
var listTemplatesFromSupabase = listTemplates;
var listTermsFromSupabase = listTerms;
var listItemsFromSupabase = listItems;

// Save/load aliases
var saveQuoteToSupabase = saveQuote;
var saveInvoice = saveInvoiceForSharing; // alias — saveInvoice was missing from v2
var saveInvoiceToSupabase = saveInvoice;
var loadQuoteFromSupabase = loadQuoteByIdFromSupabase;

// Save a quote to Supabase for sharing
async function saveQuoteForSharing(quoteData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    try {
        await prepareQuoteMediaForCloudSave(quoteData);
    } catch (error) {
        console.error('Quote photo preparation error:', error);
        return { error: error };
    }
    const now = new Date().toISOString();
    quoteData.fullResolutionPhotosEnabled = await quoteFullResolutionPhotosEnabledForSave();
    if ((quoteData.type === 'change_order' || quoteData.documentType === 'change_order') &&
        quoteData.supabaseId &&
        quoteData.parentQuoteId &&
        quoteData.supabaseId === quoteData.parentQuoteId) {
        quoteData.supabaseId = null;
    }
    if (!quoteData.supabaseId) {
        var initialSave = await saveQuote(quoteData);
        if (initialSave.error) return initialSave;
        var initialRow = Array.isArray(initialSave.data) ? initialSave.data[0] : initialSave.data;
        if (!initialRow || !initialRow.id) return { error: { message: 'Quote could not be confirmed in the cloud before sharing.' } };
        quoteData.supabaseId = initialRow.id;
        quoteData._serverUpdatedAt = initialRow.updated_at || null;
    }
    const payload = {
            id: quoteData.supabaseId,
            user_id: user.id,
            client_name: quoteData.clientName || '',
            quote_number: quoteData.quoteNumber || '',
            total: quoteData.grandTotal || quoteData.total || 0,
            data: quoteData,
            status: (quoteData.type === 'change_order' || quoteData.documentType === 'change_order') ? (quoteData.status === 'draft' ? 'pending_approval' : (quoteData.status || 'pending_approval')) : 'sent',
            type: quoteData.type || quoteData.documentType || 'quote',
            parent_quote_id: quoteData.parentQuoteId || null,
            change_order_number: quoteData.changeOrderNumber || null,
            updated_at: now
        };
    return qdDurableSupabaseOperation({
        entityType: 'quote',
        entityId: quoteData.supabaseId,
        entityLabel: quoteData.quoteTitle || quoteData.clientName || quoteData.quoteNumber || 'Quote',
        action: 'update',
        payload: quoteData,
        target: {
            table: 'quotes',
            action: 'update',
            values: payload,
            filters: [{ column: 'id', value: quoteData.supabaseId }],
            versionRead: { table: 'quotes', column: 'updated_at', filters: [{ column: 'id', value: quoteData.supabaseId }] },
            fallbackStripColumns: ['type', 'parent_quote_id', 'change_order_number'],
            verifyRevision: true,
            verifyVersionValue: payload.updated_at,
            selectQuoteMetadata: true,
            single: 'single'
        },
        baseVersion: quoteData._serverUpdatedAt || quoteData.serverUpdatedAt || null
    });
}

// Delete a quote from Supabase
async function deleteQuoteFromSupabase(quoteId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    var existing = await _supabase.from('quotes').select('*').eq('id', quoteId).eq('user_id', user.id).maybeSingle();
    if (existing.error) return { error: existing.error };
    var result = await qdDurableSupabaseOperation({
        entityType: (existing.data && existing.data.status === 'invoiced') ? 'invoice' : 'quote',
        entityId: quoteId,
        entityLabel: (existing.data && (existing.data.client_name || existing.data.quote_number)) || 'Quote',
        action: 'delete',
        payload: existing.data || { id: quoteId },
        target: { table: 'quotes', action: 'delete', values: {}, filters: [{ column: 'id', value: quoteId }] }
    });
    if (result.error) return result;
    return Object.assign({ success: true }, result);
}

// Load a quote from Supabase for viewing
// Load a quote for editing in the quote builder
async function loadQuoteByIdFromSupabase(supabaseId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('quotes')
        .select('*')
        .eq('id', supabaseId)
        .eq('user_id', user.id)
        .single();
    return { data, error };
}

async function loadQuoteForViewing(supabaseId) {
    const { data, error } = await _supabase
        .from('quotes')
        .select('*')
        .eq('id', supabaseId)
        .single();
    return { data, error };
}

// Save all custom items to Supabase (stored as single JSON blob per user)
async function saveItemsToSupabase(itemsData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not logged in' };
    try {
        await prepareQuoteMediaForCloudSave(itemsData);
    } catch (error) {
        return { error: error };
    }
    // Check if row exists
    const { data: existing } = await _supabase
        .from('items')
        .select('id')
        .eq('user_id', user.id)
        .single();
    var target = existing
        ? { table: 'items', action: 'update', values: { data: itemsData, updated_at: new Date().toISOString() }, filters: [{ column: 'id', value: existing.id }] }
        : { table: 'items', action: 'insert', values: { user_id: user.id, data: itemsData, updated_at: new Date().toISOString() }, dedupe: { filters: [], select: 'id,updated_at' } };
    return qdDurableSupabaseOperation({
        entityType: 'item_database',
        entityId: 'account-items-row',
        entityLabel: 'Saved item database',
        action: target.action,
        payload: itemsData,
        target: target
    });
}

// Load custom items from Supabase
async function loadItemsFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not logged in' };
    const { data, error } = await _supabase
        .from('items')
        .select('data')
        .eq('user_id', user.id)
        .single();
    return { data: data ? data.data : null, error };
}

// Save all clients to Supabase (upsert by name per user)
async function saveAllClientsToSupabase(clientsArray) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not logged in' };
    const rows = (clientsArray || []).map(c => ({
        user_id: user.id,
        name: c.name || '',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        city: c.city || '',
        notes: c.notes || '',
        crm: c.crm || {},
        updated_at: new Date().toISOString()
    }));
    return qdDurableSupabaseOperation({
        entityType: 'client_database',
        entityId: 'account',
        entityLabel: 'Client database',
        payload: clientsArray || [],
        target: { table: 'clients', action: 'replace', values: rows, onConflict: 'user_id,name', matchColumn: 'name' }
    });
}

// Load all clients from Supabase
async function loadClientsFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not logged in' };
    const { data, error } = await _supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
    return { data, error };
}

// Save business profile to Supabase user_data table
// Uses check-then-update/insert to avoid relying on upsert + unique constraint
async function saveBusinessProfile(profile) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    localStorage.setItem('ald_business_profile', JSON.stringify(profile));
    const result = await qdDurableSupabaseOperation({
        entityType: 'business_profile',
        entityId: 'account',
        entityLabel: 'Business profile',
        payload: profile,
        target: { table: 'user_data', action: 'upsert', values: { user_id: user.id, key: 'business_profile', value: profile, updated_at: new Date().toISOString() }, onConflict: 'user_id,key' }
    });
    return result;
}

async function optimizeStoredPhotoBatch(cursor, batchSize) {
    try {
        const response = await fetch(SUPABASE_URL + '/functions/v1/optimize-photo-storage', {
            method: 'POST',
            headers: await getSupabaseFunctionAuthHeaders(),
            body: JSON.stringify({
                cursor: Math.max(0, parseInt(cursor || 0, 10) || 0),
                batchSize: Math.max(1, Math.min(3, parseInt(batchSize || 1, 10) || 1))
            })
        });
        const data = await response.json().catch(function() { return {}; });
        if (!response.ok || data.error) throw new Error(data.error || 'Stored photo optimization failed');
        return { data: data };
    } catch (error) {
        return { error: error };
    }
}

async function loadBusinessProfile() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_business_profile') || '{}');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'business_profile')
        .maybeSingle();
    if (!error && data && data.value) {
        localStorage.setItem('ald_business_profile', JSON.stringify(data.value));
        return data.value;
    }
    return JSON.parse(localStorage.getItem('ald_business_profile') || '{}');
}

async function saveLogoToSupabase(base64) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    localStorage.setItem('ald_company_logo', base64);
    const result = await qdDurableSupabaseOperation({
        entityType: 'company_logo',
        entityId: 'account',
        entityLabel: 'Company logo',
        payload: { logo: base64 },
        target: { table: 'user_data', action: 'upsert', values: { user_id: user.id, key: 'company_logo', value: { logo: base64 }, updated_at: new Date().toISOString() }, onConflict: 'user_id,key' }
    });
    return result;
}

async function loadLogoFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return localStorage.getItem('ald_company_logo');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'company_logo')
        .maybeSingle();
    if (!error && data && data.value && data.value.logo) {
        localStorage.setItem('ald_company_logo', data.value.logo);
        return data.value.logo;
    }
    return localStorage.getItem('ald_company_logo');
}

async function savePaymentSettings(settings) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    localStorage.setItem('ald_payment_settings', JSON.stringify(settings));
    const result = await qdDurableSupabaseOperation({
        entityType: 'payment_settings',
        entityId: 'account',
        entityLabel: 'Payment settings',
        payload: settings,
        target: { table: 'user_data', action: 'upsert', values: { user_id: user.id, key: 'payment_settings', value: settings, updated_at: new Date().toISOString() }, onConflict: 'user_id,key' }
    });
    return result;
}

async function loadPaymentSettings() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_payment_settings') || 'null');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'payment_settings')
        .maybeSingle();
    if (!error && data && data.value) {
        localStorage.setItem('ald_payment_settings', JSON.stringify(data.value));
        return data.value;
    }
    return JSON.parse(localStorage.getItem('ald_payment_settings') || 'null');
}

function normalizeAiPhraseKey(phrase) {
    return String(phrase || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function getUserLearnedMappings() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await _supabase
        .from('ai_learned_mappings')
        .select('*')
        .eq('user_id', user.id)
        .order('usage_count', { ascending: false });
    if (error) {
        console.warn('AI learned mappings load failed:', error);
        return [];
    }
    return data || [];
}

async function checkLearnedMapping(spokenPhrase) {
    const user = await getCurrentUser();
    if (!user) return null;
    const phraseKey = normalizeAiPhraseKey(spokenPhrase);
    if (!phraseKey) return null;
    const { data, error } = await _supabase
        .from('ai_learned_mappings')
        .select('*')
        .eq('user_id', user.id)
        .eq('phrase_key', phraseKey)
        .maybeSingle();
    if (error) {
        console.warn('AI learned mapping check failed:', error);
        return null;
    }
    return data || null;
}

async function saveLearnedMapping(phrase, mappedItem, note) {
    const user = await getCurrentUser();
    if (!user || !mappedItem) return { data: null, error: 'Not authenticated' };
    const phraseKey = normalizeAiPhraseKey(phrase);
    if (!phraseKey) return { data: null, error: 'Missing phrase' };
    const { data: existing } = await _supabase
        .from('ai_learned_mappings')
        .select('usage_count')
        .eq('user_id', user.id)
        .eq('phrase_key', phraseKey)
        .maybeSingle();
    const payload = {
        user_id: user.id,
        spoken_phrase: String(phrase || '').trim(),
        phrase_key: phraseKey,
        mapped_item_category: mappedItem.category || 'Miscellaneous',
        mapped_item_name: mappedItem.name || mappedItem.description || '',
        mapped_unit: mappedItem.unitType || mappedItem.unit || 'ls',
        mapped_price: parseFloat(mappedItem.rate || mappedItem.price || 0) || 0,
        user_note: note || '',
        usage_count: (parseInt(existing && existing.usage_count, 10) || 0) + 1,
        updated_at: new Date().toISOString()
    };
    return qdDurableSupabaseOperation({
        entityType: 'ai_mapping',
        entityId: phraseKey,
        entityLabel: 'AI mapping: ' + phrase,
        payload: payload,
        target: { table: 'ai_learned_mappings', action: 'upsert', values: payload, onConflict: 'user_id,phrase_key', single: 'single' }
    });
}

async function incrementLearnedMappingUsage(mappingId) {
    if (!mappingId) return { data: null, error: 'Missing mapping id' };
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not authenticated' };
    const { data: existing, error: loadError } = await _supabase
        .from('ai_learned_mappings')
        .select('usage_count')
        .eq('id', mappingId)
        .eq('user_id', user.id)
        .maybeSingle();
    if (loadError || !existing) return { data: null, error: loadError || 'Mapping not found' };
    // qd-save-audit: noncritical usage counter; failure does not lose user-authored data.
    return await _supabase
        .from('ai_learned_mappings')
        .update({ usage_count: (parseInt(existing.usage_count, 10) || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', mappingId)
        .eq('user_id', user.id)
        .select()
        .single();
}

async function updateLearnedMapping(mappingId, phrase, mappedItem, note) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not authenticated' };
    if (!mappingId) return { data: null, error: 'Missing mapping id' };
    const phraseKey = normalizeAiPhraseKey(phrase);
    if (!phraseKey) return { data: null, error: 'Missing phrase' };
    const payload = {
        spoken_phrase: String(phrase || '').trim(),
        phrase_key: phraseKey,
        user_note: note || '',
        updated_at: new Date().toISOString()
    };
    if (mappedItem) {
        payload.mapped_item_category = mappedItem.category || 'Miscellaneous';
        payload.mapped_item_name = mappedItem.name || mappedItem.description || '';
        payload.mapped_unit = mappedItem.unitType || mappedItem.unit || 'ls';
        payload.mapped_price = parseFloat(mappedItem.rate || mappedItem.price || 0) || 0;
    }
    return qdDurableSupabaseOperation({
        entityType: 'ai_mapping',
        entityId: mappingId,
        entityLabel: 'AI mapping: ' + phrase,
        action: 'update',
        payload: payload,
        target: { table: 'ai_learned_mappings', action: 'update', values: payload, filters: [{ column: 'id', value: mappingId }], single: 'single' }
    });
}

async function deleteLearnedMapping(mappingId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    return qdDurableSupabaseOperation({
        entityType: 'ai_mapping',
        entityId: mappingId,
        entityLabel: 'AI learned mapping',
        action: 'delete',
        payload: { id: mappingId },
        target: { table: 'ai_learned_mappings', action: 'delete', values: {}, filters: [{ column: 'id', value: mappingId }], expectRows: false }
    });
}

async function getUserAiTradeRules() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await _supabase
        .from('ai_trade_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
    if (error) {
        console.warn('AI trade rules load failed:', error);
        return [];
    }
    return data || [];
}

function sanitizeAiTradeRuleClarificationOptions(options) {
    if (!Array.isArray(options)) return [];
    return options
        .map(function(option) {
            if (!option) return null;
            const quantityMode = option.quantity_mode === 'fixed' ? 'fixed' : 'per_count';
            return {
                id: option.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
                label: String(option.label || '').trim(),
                aliases: Array.isArray(option.aliases)
                    ? option.aliases.map(function(alias) { return String(alias || '').trim(); }).filter(Boolean)
                    : String(option.aliases || '').split(',').map(function(alias) { return alias.trim(); }).filter(Boolean),
                mapped_item_category: option.mapped_item_category || option.category || 'Miscellaneous',
                mapped_item_name: option.mapped_item_name || option.name || '',
                mapped_unit: option.mapped_unit || option.unitType || option.unit || 'ls',
                mapped_price: parseFloat(option.mapped_price !== undefined ? option.mapped_price : option.rate) || 0,
                quantity_mode: quantityMode,
                quantity_value: parseFloat(option.quantity_value || 1) || 1,
                count_unit_label: option.count_unit_label || '',
                default_count: parseFloat(option.default_count || 1) || 1,
                user_note: option.user_note || ''
            };
        })
        .filter(function(option) { return option && option.label && option.mapped_item_name; });
}

async function saveAiTradeRule(rule) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not authenticated' };
    const phraseKey = normalizeAiPhraseKey(rule && rule.trigger_phrase);
    if (!phraseKey) return { data: null, error: 'Missing trigger phrase' };
    const ruleType = rule && rule.rule_type === 'question' ? 'question' : 'line_item';
    const clarificationOptions = sanitizeAiTradeRuleClarificationOptions(rule && rule.clarification_options);
    const fallbackOption = clarificationOptions[0] || {};
    const payload = {
        user_id: user.id,
        trigger_phrase: String(rule.trigger_phrase || '').trim(),
        phrase_key: phraseKey,
        rule_type: ruleType,
        clarification_question: ruleType === 'question' ? String(rule.clarification_question || '').trim() : null,
        clarification_options: ruleType === 'question' ? clarificationOptions : [],
        mapped_item_category: rule.mapped_item_category || rule.category || fallbackOption.mapped_item_category || 'Miscellaneous',
        mapped_item_name: rule.mapped_item_name || rule.name || fallbackOption.mapped_item_name || '',
        mapped_unit: rule.mapped_unit || rule.unitType || rule.unit || fallbackOption.mapped_unit || 'ls',
        mapped_price: parseFloat(rule.mapped_price !== undefined ? rule.mapped_price : (rule.rate !== undefined ? rule.rate : fallbackOption.mapped_price)) || 0,
        quantity_mode: rule.quantity_mode || fallbackOption.quantity_mode || 'per_count',
        quantity_value: parseFloat(rule.quantity_value || fallbackOption.quantity_value || 1) || 1,
        count_unit_label: rule.count_unit_label || fallbackOption.count_unit_label || '',
        default_count: parseFloat(rule.default_count || fallbackOption.default_count || 1) || 1,
        user_note: rule.user_note || '',
        active: rule.active !== false,
        updated_at: new Date().toISOString()
    };
    if (rule.id) {
        return qdDurableSupabaseOperation({
            entityType: 'ai_trade_rule',
            entityId: rule.id,
            entityLabel: 'AI trade rule: ' + payload.trigger_phrase,
            action: 'update',
            payload: payload,
            target: { table: 'ai_trade_rules', action: 'update', values: payload, filters: [{ column: 'id', value: rule.id }], single: 'single' }
        });
    }
    return qdDurableSupabaseOperation({
        entityType: 'ai_trade_rule',
        entityId: phraseKey,
        entityLabel: 'AI trade rule: ' + payload.trigger_phrase,
        payload: payload,
        target: { table: 'ai_trade_rules', action: 'upsert', values: payload, onConflict: 'user_id,phrase_key', single: 'single' }
    });
}

async function deleteAiTradeRule(ruleId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    return qdDurableSupabaseOperation({
        entityType: 'ai_trade_rule',
        entityId: ruleId,
        entityLabel: 'AI trade rule',
        action: 'delete',
        payload: { id: ruleId },
        target: { table: 'ai_trade_rules', action: 'delete', values: {}, filters: [{ column: 'id', value: ruleId }], expectRows: false }
    });
}

async function incrementAiTradeRuleUsage(ruleId) {
    if (!ruleId) return { data: null, error: 'Missing rule id' };
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not authenticated' };
    const { data: existing, error: loadError } = await _supabase
        .from('ai_trade_rules')
        .select('usage_count')
        .eq('id', ruleId)
        .eq('user_id', user.id)
        .maybeSingle();
    if (loadError || !existing) return { data: null, error: loadError || 'Rule not found' };
    // qd-save-audit: noncritical usage counter; failure does not lose user-authored data.
    return await _supabase
        .from('ai_trade_rules')
        .update({ usage_count: (parseInt(existing.usage_count, 10) || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', ruleId)
        .eq('user_id', user.id)
        .select()
        .single();
}

async function getUserAiVoiceTemplates() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_ai_voice_templates') || '[]');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'ai_voice_templates')
        .maybeSingle();
    if (error) {
        console.warn('AI voice templates load failed:', error);
        return JSON.parse(localStorage.getItem('ald_ai_voice_templates') || '[]');
    }
    const templates = Array.isArray(data && data.value) ? data.value : [];
    localStorage.setItem('ald_ai_voice_templates', JSON.stringify(templates));
    return templates;
}

async function saveUserAiVoiceTemplates(templates) {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    localStorage.setItem('ald_ai_voice_templates', JSON.stringify(safeTemplates));
    const user = await getCurrentUser();
    if (!user) return { data: safeTemplates, error: null };
    return saveUserDataValue('ai_voice_templates', safeTemplates, { entityType: 'quote_preferences', entityLabel: 'AI voice templates', localStorageKey: 'ald_ai_voice_templates' });
}

const QUOTEDR_PLAN_FEATURES = {
    basic: [
        'quotes',
        'invoices',
        'clients',
        'templates',
        'custom_branding',
        'stripe_payments',
        'client_quote_viewer',
        'cross_device_sync'
    ],
    pro: [
        'quotes',
        'invoices',
        'clients',
        'templates',
        'custom_branding',
        'stripe_payments',
        'client_quote_viewer',
        'cross_device_sync',
        'ai_voice_quote',
        'ai_assistant',
        'smart_import',
        'quote_import',
        'ai_refine',
        'ikea_quoter',
        'job_tracker',
        'labor_tracker',
        'floor_plan_scanner',
        'quote_upsells',
        'full_resolution_photos',
        'profit_tracking',
        'payment_reminders',
        'quickbooks',
        'bank_card_sync'
    ]
};

const QUOTEDR_PRO_FEATURE_LABELS = {
    ikea_quoter: 'IKEA Cabinet Quoter',
    job_tracker: 'Job Tracker',
    labor_tracker: 'Labour Tracker',
    ai_refine: 'AI Refine',
    quote_import: 'Legacy Quote Import',
    full_resolution_photos: 'Full-resolution item photos',
    quickbooks: 'QuickBooks sync',
    bank_card_sync: 'Bank/card sync'
};

function normalizePlanName(plan) {
    plan = String(plan || 'basic').toLowerCase();
    if (plan === 'starter') return 'basic';
    return plan === 'pro' ? 'pro' : 'basic';
}

function subscriptionAllowsAccess(sub) {
    if (!sub || !sub.status) return false;
    return ['active', 'trialing'].includes(String(sub.status).toLowerCase());
}

async function loadSubscriptionStatus() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_subscription') || 'null');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'subscription_status')
        .maybeSingle();
    if (!error && data && data.value) {
        localStorage.setItem('ald_subscription', JSON.stringify(data.value));
        return data.value;
    }
    return JSON.parse(localStorage.getItem('ald_subscription') || 'null');
}

async function getCurrentPlan() {
    const sub = await loadSubscriptionStatus();
    if (!subscriptionAllowsAccess(sub)) return 'basic';
    return normalizePlanName(sub.plan || 'basic');
}

async function hasFeature(feature) {
    const plan = await getCurrentPlan();
    return (QUOTEDR_PLAN_FEATURES[plan] || QUOTEDR_PLAN_FEATURES.basic).includes(feature);
}

async function isCurrentUserPro() {
    const sub = await loadSubscriptionStatus();
    return subscriptionAllowsAccess(sub) && normalizePlanName(sub.plan || 'basic') === 'pro';
}

async function loadProTrialUsage() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_pro_trial_usage') || '{}');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'pro_trial_usage')
        .maybeSingle();
    if (!error && data && data.value) {
        localStorage.setItem('ald_pro_trial_usage', JSON.stringify(data.value));
        return data.value;
    }
    return JSON.parse(localStorage.getItem('ald_pro_trial_usage') || '{}');
}

async function saveProTrialUsage(usage) {
    const user = await getCurrentUser();
    localStorage.setItem('ald_pro_trial_usage', JSON.stringify(usage || {}));
    if (!user) return { data: null, error: null };
    // qd-save-audit: entitlement telemetry is not user-authored business data.
    return await _supabase
        .from('user_data')
        .upsert({ user_id: user.id, key: 'pro_trial_usage', value: usage || {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
}

function qdProPricingUrl(featureKey) {
    return 'pricing.html?plan=pro&feature=' + encodeURIComponent(featureKey || 'pro');
}

function qdCaptureEvent(name, props) {
    try {
        if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.capture === 'function') {
            window.QuoteDrAnalytics.capture(name, props || {});
            return;
        }
        if (window.posthog && typeof window.posthog.capture === 'function') {
            window.posthog.capture(name, props || {});
        }
    } catch(e) {}
}

function qdCaptureOnce(name, key, props) {
    try {
        if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.captureOnce === 'function') {
            window.QuoteDrAnalytics.captureOnce(name, key, props || {});
            return;
        }
    } catch(e) {}
    qdCaptureEvent(name, props);
}

function qdIdentifyAnalyticsUser(user) {
    try {
        if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.identifyUser === 'function') {
            window.QuoteDrAnalytics.identifyUser(user);
        }
    } catch(e) {}
}

function qdAnalyticsBucketMoney(value) {
    try {
        if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.bucketMoney === 'function') {
            return window.QuoteDrAnalytics.bucketMoney(value);
        }
    } catch(e) {}
    var amount = parseFloat(value) || 0;
    if (amount <= 0) return '0';
    if (amount < 500) return '<500';
    if (amount < 2500) return '500-2499';
    if (amount < 10000) return '2500-9999';
    if (amount < 25000) return '10000-24999';
    return '25000+';
}

const QD_PLAY_DAY_MS = 24 * 60 * 60 * 1000;
const QD_PLAY_DAY_GRACE_MS = 30 * 60 * 1000;
const QD_PLAY_DAY_WARNING_MS = 2 * 60 * 60 * 1000;

function qdEscapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function qdTrialLabel(featureKey, featureLabel) {
    return featureLabel || QUOTEDR_PRO_FEATURE_LABELS[featureKey] || 'this Pro tool';
}

function qdTrialActivationId(trial) {
    return trial && (trial.started_at || trial.expires_at || trial.used_at || 'unknown');
}

function qdGetTrialStatus(trial, now) {
    now = now || new Date();
    if (!trial) return 'none';
    if (trial.expires_at) {
        var expiresAt = new Date(trial.expires_at);
        if (isNaN(expiresAt.getTime())) return 'expired';
        if (now <= expiresAt) return 'active';
        if (now <= new Date(expiresAt.getTime() + QD_PLAY_DAY_GRACE_MS)) return 'grace';
        return 'expired';
    }
    return trial.used ? 'expired' : 'none';
}

function qdTrialTimeRemaining(trial, now) {
    now = now || new Date();
    if (!trial || !trial.expires_at) return 0;
    var expiresAt = new Date(trial.expires_at);
    if (isNaN(expiresAt.getTime())) return 0;
    return expiresAt.getTime() - now.getTime();
}

function qdFormatTrialRemaining(ms) {
    if (ms <= 0) return 'grace period';
    var minutes = Math.ceil(ms / 60000);
    if (minutes < 60) return minutes + ' min left';
    var hours = Math.floor(minutes / 60);
    var rem = minutes % 60;
    return hours + 'h' + (rem ? ' ' + rem + 'm' : '') + ' left';
}

function qdActiveTrialEntries(usage, includeGrace) {
    usage = usage || {};
    var now = new Date();
    return Object.entries(usage).map(function(pair) {
        var key = pair[0];
        var trial = pair[1] || {};
        var status = qdGetTrialStatus(trial, now);
        if (status !== 'active' && (!includeGrace || status !== 'grace')) return null;
        return {
            key: key,
            trial: trial,
            status: status,
            label: trial.label || trial.feature || QUOTEDR_PRO_FEATURE_LABELS[key] || key,
            remainingMs: qdTrialTimeRemaining(trial, now)
        };
    }).filter(Boolean).sort(function(a, b) {
        return a.remainingMs - b.remainingMs;
    });
}

function showProTrialModal(featureKey, featureLabel) {
    featureLabel = featureLabel || QUOTEDR_PRO_FEATURE_LABELS[featureKey] || 'this Pro tool';
    return new Promise(function(resolve) {
        var existing = document.getElementById('quotedrProTrialModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'quotedrProTrialModal';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = '' +
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content" style="border-radius:16px;border:0;box-shadow:0 18px 45px rgba(15,23,42,.2);">' +
                    '<div class="modal-header">' +
                        '<h5 class="modal-title d-flex align-items-center gap-2">' +
                            '<span style="width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#e8f2ff;color:#1a56a0;"><i class="fas fa-star"></i></span>' +
                            '<span>Play For a Day</span>' +
                        '</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-2"><strong>' + qdEscapeHtml(featureLabel) + '</strong> is a Pro feature, but we will let you play with it for 24 hours.</p>' +
                        '<p class="text-muted small mb-0">The timer starts when you click start. No commitment, no credit card.</p>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" id="quotedrProBack">Go Back</button>' +
                        '<button type="button" class="btn btn-primary" id="quotedrProTry">Start 24-Hour Trial</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        function cleanup(value) {
            if (window.bootstrap && window.bootstrap.Modal) {
                var inst = window.bootstrap.Modal.getInstance(modal);
                if (inst) inst.hide();
            }
            setTimeout(function() { if (modal.parentNode) modal.remove(); }, 250);
            resolve(value);
        }

        modal.querySelector('#quotedrProTry').addEventListener('click', function() { cleanup('try'); });
        modal.querySelector('#quotedrProBack').addEventListener('click', function() { cleanup(false); });
        modal.querySelector('.btn-close').addEventListener('click', function() { cleanup(false); });
        document.body.appendChild(modal);

        if (window.bootstrap && window.bootstrap.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(modal).show();
            modal.addEventListener('hidden.bs.modal', function() { resolve(false); }, { once: true });
        } else {
            modal.classList.add('show');
            modal.style.display = 'block';
            modal.style.background = 'rgba(15,23,42,.45)';
        }
    });
}

function qdShowProUpgradePrompt(featureKey, featureLabel, message, title) {
    featureLabel = qdTrialLabel(featureKey, featureLabel);
    var msg = message || ('Ready to unlock ' + featureLabel + ' permanently? Pro includes IKEA quoting, job tracking, AI tools, QuickBooks sync, and more.');
    var pricingUrl = qdProPricingUrl(featureKey);
    qdCaptureEvent('pro_upgrade_prompt_shown', { feature: featureKey, label: featureLabel, title: title || 'Unlock QuoteDr Pro' });
    if (typeof window.qdConfirm === 'function') {
        window.qdConfirm(msg, {
            title: title || 'Unlock QuoteDr Pro',
            okText: 'Upgrade to Pro',
            cancelText: 'Maybe later',
            okClass: 'btn-primary',
            type: 'info'
        }).then(function(confirmed) {
            if (confirmed) {
                qdCaptureEvent('pro_upgrade_clicked', { feature: featureKey });
                window.location.href = pricingUrl;
            }
        });
        return;
    }
    showUpgradePromptFallback(featureLabel, msg, pricingUrl);
}

function showProTrialCompletePrompt(featureKey, featureLabel) {
    qdShowProUpgradePrompt(featureKey, featureLabel, 'Nice. You have started using ' + qdTrialLabel(featureKey, featureLabel) + '. Upgrade whenever you are ready to keep it permanently.', 'Keep This Pro Tool');
}

async function startPlayForADayTrial(featureKey, featureLabel, metadata, source) {
    var usage = await loadProTrialUsage();
    var now = new Date();
    var expires = new Date(now.getTime() + QD_PLAY_DAY_MS);
    var due = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    var previous = usage[featureKey] || {};
    usage[featureKey] = Object.assign({}, usage[featureKey] || {}, {
        feature: featureKey,
        label: featureLabel || QUOTEDR_PRO_FEATURE_LABELS[featureKey] || featureKey,
        status: 'active',
        used: true,
        used_at: now.toISOString(),
        started_at: now.toISOString(),
        expires_at: expires.toISOString(),
        source: source || 'self_started',
        activations: (parseInt(previous.activations || 0, 10) || 0) + 1,
        followup_due_at: due.toISOString(),
        followup_sent_at: null,
        metadata: metadata || {}
    });
    var result = await saveProTrialUsage(usage);
    if (result && result.error) throw result.error;
    window._quotedrActiveProTrials = window._quotedrActiveProTrials || {};
    window._quotedrActiveProTrials[featureKey] = true;
    qdCaptureEvent('pro_play_day_started', { feature: featureKey, label: usage[featureKey].label, expires_at: usage[featureKey].expires_at });
    qdCaptureEvent('pro_trial_used', { feature: featureKey, label: usage[featureKey].label });
    refreshPlayForADayWidget(usage);
    return usage[featureKey];
}

async function markProTrialUsed(featureKey, featureLabel, metadata) {
    return startPlayForADayTrial(featureKey, featureLabel, metadata, 'self_started');
}

function qdOpenFeedbackForTrial(featureKey, featureLabel) {
    var subject = encodeURIComponent('QuoteDr feedback for ' + qdTrialLabel(featureKey, featureLabel));
    window.location.href = 'mailto:support@quotedr.io?subject=' + subject;
}

function showProGracePrompt(featureKey, featureLabel, trial) {
    var guardKey = 'quotedr_play_day_grace_' + featureKey + '_' + qdTrialActivationId(trial);
    try {
        if (sessionStorage.getItem(guardKey) === '1') return;
        sessionStorage.setItem(guardKey, '1');
    } catch(e) {}
    qdCaptureEvent('pro_play_day_grace_access', { feature: featureKey, label: qdTrialLabel(featureKey, featureLabel) });
    var msg = 'Your Play For a Day trial for ' + qdTrialLabel(featureKey, featureLabel) + ' ended, but you have 30 more minutes. Upgrade now to keep access, or send feedback about what worked and what did not.';
    if (typeof window.qdConfirm === 'function') {
        window.qdConfirm(msg, {
            title: 'Trial Grace Period',
            okText: 'Upgrade Now',
            cancelText: 'Send Feedback',
            okClass: 'btn-warning',
            type: 'warning'
        }).then(function(confirmed) {
            if (confirmed) {
                qdCaptureEvent('pro_upgrade_prompt_clicked', { feature: featureKey, trigger: 'grace' });
                window.location.href = qdProPricingUrl(featureKey);
            } else {
                qdOpenFeedbackForTrial(featureKey, featureLabel);
            }
        });
        return;
    }
    qdShowProUpgradePrompt(featureKey, featureLabel, msg, 'Trial Grace Period');
}

async function requireProFeature(featureKey, featureLabel, options) {
    options = options || {};
    featureLabel = featureLabel || QUOTEDR_PRO_FEATURE_LABELS[featureKey] || 'This feature';
    if (await isCurrentUserPro()) return true;

    var usage = await loadProTrialUsage();
    var passKey = 'quotedr_pro_trial_pass_' + featureKey;
    try {
        if (sessionStorage.getItem(passKey) === '1') {
            sessionStorage.removeItem(passKey);
            window._quotedrActiveProTrials = window._quotedrActiveProTrials || {};
            window._quotedrActiveProTrials[featureKey] = true;
            qdCaptureEvent('pro_play_day_active_access', { feature: featureKey, label: featureLabel, cross_page: true });
            return true;
        }
    } catch(e) {}

    var trial = usage && usage[featureKey] ? usage[featureKey] : null;
    var status = qdGetTrialStatus(trial);
    if (status === 'active') {
        window._quotedrActiveProTrials = window._quotedrActiveProTrials || {};
        window._quotedrActiveProTrials[featureKey] = true;
        qdCaptureEvent('pro_play_day_active_access', { feature: featureKey, label: featureLabel });
        refreshPlayForADayWidget(usage);
        return true;
    }
    if (status === 'grace') {
        window._quotedrActiveProTrials = window._quotedrActiveProTrials || {};
        window._quotedrActiveProTrials[featureKey] = true;
        showProGracePrompt(featureKey, featureLabel, trial);
        refreshPlayForADayWidget(usage);
        return true;
    }
    if (trial && (trial.used || trial.expires_at)) {
        qdCaptureEvent('pro_play_day_expired', { feature: featureKey, label: featureLabel });
        qdShowProUpgradePrompt(featureKey, featureLabel, 'Your Play For a Day access for ' + featureLabel + ' has ended. Upgrade to Pro to unlock it permanently.', 'Play For a Day Ended');
        return false;
    }

    qdCaptureEvent('pro_play_day_prompt_shown', { feature: featureKey, label: featureLabel });
    var choice = await showProTrialModal(featureKey, featureLabel);
    if (choice !== 'try') {
        qdCaptureEvent('pro_play_day_declined', { feature: featureKey, label: featureLabel });
        return false;
    }
    try {
        await startPlayForADayTrial(featureKey, featureLabel, options.metadata || {}, options.source || 'self_started');
    } catch(e) {
        if (typeof qdAlert === 'function') qdAlert('Could not start the 24-hour trial. Please try again.');
        else alert('Could not start the 24-hour trial. Please try again.');
        return false;
    }
    if (options.crossPage) {
        try { sessionStorage.setItem(passKey, '1'); } catch(e) {}
    }
    return true;
}

function completeProTrialFeature(featureKey, featureLabel) {
    if (!window._quotedrActiveProTrials || !window._quotedrActiveProTrials[featureKey]) return;
    qdMaybeShowProUpgradePrompt('feature_completed', {
        featureKey: featureKey,
        featureLabel: featureLabel,
        message: 'That was a Pro workflow. Upgrade when you are ready to keep ' + qdTrialLabel(featureKey, featureLabel) + ' permanently.'
    });
}

function qdSmartPromptKey(trigger, featureKey, trial) {
    return 'quotedr_smart_prompt_' + trigger + '_' + (featureKey || 'general') + '_' + qdTrialActivationId(trial || {});
}

async function qdMaybeShowProUpgradePrompt(trigger, options) {
    options = options || {};
    if (await isCurrentUserPro()) return false;
    try {
        if (sessionStorage.getItem('quotedr_smart_prompt_session') === '1') return false;
    } catch(e) {}
    var usage = await loadProTrialUsage();
    var entries = qdActiveTrialEntries(usage, true);
    if (!entries.length) return false;
    var featureKey = options.featureKey || entries[0].key;
    var entry = entries.find(function(item) { return item.key === featureKey; }) || entries[0];
    var key = qdSmartPromptKey(trigger, entry.key, entry.trial);
    try {
        if (localStorage.getItem(key) === '1') return false;
        localStorage.setItem(key, '1');
        sessionStorage.setItem('quotedr_smart_prompt_session', '1');
    } catch(e) {}
    var message = options.message || 'Get unlimited access with QuoteDr Pro.';
    qdCaptureEvent('pro_upgrade_prompt_shown', { trigger: trigger, feature: entry.key, label: entry.label });
    if (typeof window.qdConfirm === 'function') {
        window.qdConfirm(message, {
            title: options.title || 'Keep Building With Pro',
            okText: 'Upgrade to Pro',
            cancelText: 'Not now',
            okClass: 'btn-primary',
            type: 'info'
        }).then(function(confirmed) {
            if (confirmed) {
                qdCaptureEvent('pro_upgrade_prompt_clicked', { trigger: trigger, feature: entry.key });
                window.location.href = qdProPricingUrl(entry.key);
            }
        });
    } else {
        showUpgradePromptFallback(entry.label, message, qdProPricingUrl(entry.key));
    }
    return true;
}

async function qdMaybeShowSecondQuoteUpgradePrompt() {
    try {
        if (await isCurrentUserPro()) return false;
        var user = await getCurrentUser();
        if (!user) return false;
        var active = qdActiveTrialEntries(await loadProTrialUsage(), true);
        if (!active.length) return false;
        var res = await _supabase
            .from('quotes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .neq('quote_number', '__ITEMS_BACKUP__');
        if (!res.error && (res.count || 0) >= 2) {
            return qdMaybeShowProUpgradePrompt('second_quote_saved', {
                message: 'Love QuoteDr? Upgrade now and keep building with unlimited Pro tools.'
            });
        }
    } catch(e) {}
    return false;
}

function showPlayForADayStatusModal(entries) {
    var existing = document.getElementById('quotedrPlayDayStatusModal');
    if (existing) existing.remove();
    var rows = entries.map(function(entry) {
        var remaining = entry.status === 'grace' ? 'Grace period' : qdFormatTrialRemaining(entry.remainingMs);
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eef2f7;">' +
            '<div><strong>' + qdEscapeHtml(entry.label) + '</strong><div class="text-muted small">' + (entry.status === 'grace' ? 'Trial ended, grace access active' : 'Play For a Day active') + '</div></div>' +
            '<div style="font-weight:800;color:' + (entry.status === 'grace' ? '#b45309' : '#1a56a0') + ';white-space:nowrap;">' + remaining + '</div>' +
        '</div>';
    }).join('');
    var modal = document.createElement('div');
    modal.id = 'quotedrPlayDayStatusModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = '' +
        '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content" style="border-radius:16px;border:0;box-shadow:0 18px 45px rgba(15,23,42,.2);">' +
                '<div class="modal-header">' +
                    '<h5 class="modal-title"><i class="fas fa-hourglass-half me-2 text-warning"></i>Play For a Day</h5>' +
                    '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body">' + rows + '</div>' +
                '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" id="quotedrPlayDayFeedback">Send Feedback</button>' +
                    '<button type="button" class="btn btn-primary" id="quotedrPlayDayUpgrade">Upgrade to Pro</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#quotedrPlayDayUpgrade').addEventListener('click', function() {
        qdCaptureEvent('pro_upgrade_prompt_clicked', { trigger: 'trial_status', feature: entries[0] && entries[0].key });
        window.location.href = qdProPricingUrl(entries[0] && entries[0].key);
    });
    modal.querySelector('#quotedrPlayDayFeedback').addEventListener('click', function() {
        qdOpenFeedbackForTrial(entries[0] && entries[0].key, entries[0] && entries[0].label);
    });
    qdCaptureEvent('pro_play_day_status_opened', { active_count: entries.length });
    if (window.bootstrap && window.bootstrap.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
        modal.addEventListener('hidden.bs.modal', function() { modal.remove(); }, { once: true });
    } else {
        alert(entries.map(function(entry) { return entry.label + ': ' + qdFormatTrialRemaining(entry.remainingMs); }).join('\n'));
        modal.remove();
    }
}

async function refreshPlayForADayWidget(cachedUsage) {
    try {
        if (await isCurrentUserPro()) {
            var proExisting = document.getElementById('quotedrPlayDayWidget');
            if (proExisting) proExisting.remove();
            return;
        }
        var usage = cachedUsage || await loadProTrialUsage();
        var entries = qdActiveTrialEntries(usage, true);
        var existing = document.getElementById('quotedrPlayDayWidget');
        if (!entries.length) {
            if (existing) existing.remove();
            return;
        }
        var soonest = entries[0];
        if (!existing) {
            existing = document.createElement('button');
            existing.id = 'quotedrPlayDayWidget';
            existing.type = 'button';
            existing.style.cssText = 'position:fixed;left:18px;bottom:18px;z-index:1040;border:0;border-radius:999px;background:#0f3460;color:#fff;padding:10px 14px;box-shadow:0 8px 24px rgba(15,52,96,.28);font-weight:800;font-size:0.86rem;display:flex;align-items:center;gap:8px;';
            existing.addEventListener('click', function() { showPlayForADayStatusModal(entries); });
            document.body.appendChild(existing);
        }
        existing.innerHTML = '<i class="fas fa-hourglass-half"></i><span>Play Day: ' + qdEscapeHtml(qdFormatTrialRemaining(soonest.remainingMs)) + '</span>';
        existing.onclick = function() { showPlayForADayStatusModal(entries); };

        entries.forEach(function(entry) {
            if (entry.status === 'active' && entry.remainingMs > 0 && entry.remainingMs <= QD_PLAY_DAY_WARNING_MS) {
                qdMaybeShowProUpgradePrompt('two_hours_remaining', {
                    featureKey: entry.key,
                    featureLabel: entry.label,
                    title: 'Pro Access Expires Soon',
                    message: 'Your Play For a Day access to ' + entry.label + ' expires soon. Upgrade now to keep it.'
                });
            }
            if (entry.status === 'grace') {
                showProGracePrompt(entry.key, entry.label, entry.trial);
            }
        });
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() { refreshPlayForADayWidget(); }, 900);
    setInterval(function() { refreshPlayForADayWidget(); }, 60000);
});

window.qdMaybeShowProUpgradePrompt = qdMaybeShowProUpgradePrompt;
window.qdMaybeShowSecondQuoteUpgradePrompt = qdMaybeShowSecondQuoteUpgradePrompt;
window.refreshPlayForADayWidget = refreshPlayForADayWidget;
window.getLaborNotificationSettings = getLaborNotificationSettings;
window.saveLaborNotificationSettings = saveLaborNotificationSettings;
window.submitLaborDailyCheckin = submitLaborDailyCheckin;
window.listLaborProductionRates = listLaborProductionRates;

function getMeasurementSystem() {
    try {
        var prefs = JSON.parse(localStorage.getItem('ald_quote_prefs') || '{}');
        return prefs.measurementSystem === 'metric' ? 'metric' : 'imperial';
    } catch(e) {
        return 'imperial';
    }
}

function qdNormalizeUnit(unit) {
    return String(unit || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
}

function qdMeasurementDecimals(value) {
    value = Math.abs(parseFloat(value) || 0);
    if (value >= 100) return 0;
    if (value >= 10) return 1;
    return 2;
}

function qdFormatMeasurementNumber(value, decimals) {
    value = parseFloat(value) || 0;
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals !== undefined ? decimals : qdMeasurementDecimals(value)
    });
}

function qdDisplayUnit(unit) {
    var system = getMeasurementSystem();
    var normalized = qdNormalizeUnit(unit);
    if (system === 'metric') {
        if (['sqft','sf','sqfeet','squarefeet','sqft'].includes(normalized)) return 'm\u00b2';
        if (['lf','linearft','linearfeet','ft','feet','foot'].includes(normalized)) return 'm';
        if (['in','inch','inches'].includes(normalized)) return 'cm';
        if (['m2','m\u00b2','sqm','squaremeter','squaremeters'].includes(normalized)) return 'm\u00b2';
        if (['m','meter','meters','metre','metres'].includes(normalized)) return 'm';
        if (['cm','centimeter','centimeters','centimetre','centimetres'].includes(normalized)) return 'cm';
    }
    if (['m2','m\u00b2','sqm','squaremeter','squaremeters'].includes(normalized)) return 'sq ft';
    if (['m','meter','meters','metre','metres'].includes(normalized)) return 'LF';
    if (['cm','centimeter','centimeters','centimetre','centimetres'].includes(normalized)) return 'in';
    if (['sqft','sf','sqfeet','squarefeet'].includes(normalized)) return 'sq ft';
    if (['lf','linearft','linearfeet'].includes(normalized)) return 'LF';
    if (['ft','feet','foot'].includes(normalized)) return 'ft';
    if (['in','inch','inches'].includes(normalized)) return 'in';
    return unit || '';
}

function qdConvertMeasurementValue(value, unit) {
    var system = getMeasurementSystem();
    var normalized = qdNormalizeUnit(unit);
    value = parseFloat(value) || 0;
    if (system !== 'metric') {
        if (['m2','m\u00b2','sqm','squaremeter','squaremeters'].includes(normalized)) return value / 0.09290304;
        if (['m','meter','meters','metre','metres'].includes(normalized)) return value / 0.3048;
        if (['cm','centimeter','centimeters','centimetre','centimetres'].includes(normalized)) return value / 2.54;
        return value;
    }
    if (['sqft','sf','sqfeet','squarefeet'].includes(normalized)) return value * 0.09290304;
    if (['lf','linearft','linearfeet','ft','feet','foot'].includes(normalized)) return value * 0.3048;
    if (['in','inch','inches'].includes(normalized)) return value * 2.54;
    return value;
}

function qdFormatQuantity(quantity, unit) {
    var converted = qdConvertMeasurementValue(quantity, unit);
    var displayUnit = qdDisplayUnit(unit);
    return qdFormatMeasurementNumber(converted) + (displayUnit ? ' ' + displayUnit : '');
}

function qdConvertMetricInputToImperial(value, unit) {
    if (getMeasurementSystem() !== 'metric') return parseFloat(value) || 0;
    var normalized = qdNormalizeUnit(unit);
    value = parseFloat(value) || 0;
    if (['sqft','sf','sqfeet','squarefeet'].includes(normalized)) return value / 0.09290304;
    if (['lf','linearft','linearfeet','ft','feet','foot'].includes(normalized)) return value / 0.3048;
    if (['in','inch','inches'].includes(normalized)) return value / 2.54;
    return value;
}

window.getMeasurementSystem = getMeasurementSystem;
window.qdDisplayUnit = qdDisplayUnit;
window.qdFormatQuantity = qdFormatQuantity;
window.qdConvertMeasurementValue = qdConvertMeasurementValue;
window.qdConvertMetricInputToImperial = qdConvertMetricInputToImperial;

function showUpgradePrompt(featureName) {
    var label = featureName || 'This feature';
    var msg = label + ' is included with QuoteDr Pro. Upgrade to unlock this tool.';
    var pricingUrl = 'pricing.html?feature=' + encodeURIComponent(label);

    if (typeof window.qdConfirm === 'function') {
        window.qdConfirm(msg, {
            title: 'Upgrade Required',
            okText: 'View Plans',
            cancelText: 'Not now',
            okClass: 'btn-primary',
            type: 'warning'
        }).then(function(confirmed) {
            if (confirmed) window.location.href = pricingUrl;
        });
        return;
    }

    showUpgradePromptFallback(label, msg, pricingUrl);
}

function showUpgradePromptFallback(label, msg, pricingUrl) {
    var existing = document.getElementById('quotedrUpgradePromptModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'quotedrUpgradePromptModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'quotedrUpgradePromptTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '' +
        '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content" style="border-radius:16px;border:0;box-shadow:0 18px 45px rgba(15,23,42,.2);">' +
                '<div class="modal-header">' +
                    '<h5 class="modal-title d-flex align-items-center gap-2" id="quotedrUpgradePromptTitle">' +
                        '<span style="width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#fff7ed;color:#f27a1a;"><i class="fas fa-exclamation"></i></span>' +
                        '<span>Upgrade Required</span>' +
                    '</h5>' +
                    '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body"><p class="mb-0"></p></div>' +
                '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Not now</button>' +
                    '<button type="button" class="btn btn-primary" id="quotedrUpgradePromptPlans">View Plans</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    modal.querySelector('.modal-body p').textContent = msg;
    modal.querySelector('#quotedrUpgradePromptPlans').addEventListener('click', function() {
        window.location.href = pricingUrl;
    });
    document.body.appendChild(modal);

    if (window.bootstrap && window.bootstrap.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
        modal.addEventListener('hidden.bs.modal', function() {
            modal.remove();
        }, { once: true });
        return;
    }

    modal.classList.add('show');
    modal.style.display = 'block';
    modal.style.background = 'rgba(15,23,42,.45)';
    modal.removeAttribute('aria-hidden');
    var closeButtons = modal.querySelectorAll('[data-bs-dismiss="modal"], .btn-close');
    closeButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            modal.remove();
        });
    });
}

async function requireFeature(feature, featureName) {
    if (await hasFeature(feature)) return true;
    showUpgradePrompt(featureName);
    return false;
}

async function refreshSubscriptionBanner() {
    var sub = await loadSubscriptionStatus();
    var existing = document.getElementById('subscriptionStatusBanner');
    if (existing) existing.remove();
    if (!sub || subscriptionAllowsAccess(sub)) return;
    var banner = document.createElement('div');
    banner.id = 'subscriptionStatusBanner';
    banner.style.cssText = 'background:#fff3cd;border-bottom:1px solid #ffc107;text-align:center;padding:8px;font-size:0.9rem;';
    banner.innerHTML = 'Your QuoteDr subscription needs attention. <a href="pricing.html" style="color:#1a56a0;font-weight:600;">View plans</a>';
    document.body.insertBefore(banner, document.body.firstChild);
}

// Supabase RLS policies needed:
/*
-- Allow anyone to read quotes (for sharing)
CREATE POLICY "Public quote viewing" ON quotes FOR SELECT USING (true);
-- Allow authenticated users to insert/update their own quotes  
CREATE POLICY "Users manage own quotes" ON quotes FOR ALL USING (auth.uid() = user_id);
*/
// ============================================================
// Items Cloud Backup (moved from supabase.js - available in quote-builder)
// ============================================================
async function backupItemsToCloud(customItems) {
    // Use getUser() directly to ensure fresh session token is used
    const { data: { user }, error: authErr } = await _supabase.auth.getUser();
    if (authErr || !user) return { error: 'Not authenticated' };
    try {
        await prepareQuoteMediaForCloudSave(customItems);
        if (typeof persistManageItemsLocalSnapshot === 'function') persistManageItemsLocalSnapshot(customItems);
    } catch (error) {
        return { error: error };
    }
    const snapshot = JSON.stringify(customItems || {});
    const now = new Date().toISOString();
    const payload = {
        user_id: user.id,
        client_name: '__ITEMS_BACKUP__',
        quote_number: '__ITEMS_BACKUP__',
        status: 'backup',
        data: { items_snapshot: snapshot, backed_up_at: now },
        updated_at: now
    };
    var existing = await _supabase.from('quotes').select('id,updated_at').eq('user_id', user.id).eq('quote_number', '__ITEMS_BACKUP__').limit(1).maybeSingle();
    if (existing.error) return { error: existing.error };
    var target = existing.data
        ? {
            table: 'quotes',
            action: 'update',
            values: payload,
            filters: [{ column: 'id', value: existing.data.id }],
            versionRead: { table: 'quotes', column: 'updated_at', filters: [{ column: 'id', value: existing.data.id }] }
        }
        : {
            table: 'quotes',
            action: 'insert',
            values: Object.assign({ created_at: now }, payload),
            dedupe: { filters: [{ column: 'quote_number', value: '__ITEMS_BACKUP__' }], select: 'id,updated_at' }
        };
    var result = await qdDurableSupabaseOperation({
        entityType: 'item_database',
        entityId: 'account',
        entityLabel: 'Saved item database',
        action: target.action,
        payload: customItems || {},
        target: target,
        baseVersion: existing.data ? existing.data.updated_at : null
    });
    if (!result.error) {
        console.log('[Backup] Items backup confirmed:', Object.keys(customItems || {}).length, 'categories');
        // qd-save-audit: optional history snapshot; the durable item_database operation is authoritative.
        _supabase.from('item_history').insert({ user_id: user.id, snapshot: customItems, created_at: now }).then(function() {}).catch(function() {});
    }
    return result;
}

async function restoreItemsFromCloud() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('quotes')
        .select('data, updated_at')
        .eq('user_id', user.id)
        .eq('quote_number', '__ITEMS_BACKUP__')
        .single();
    if (!error && data) {
        try {
            const snapshot = JSON.parse(data.data.items_snapshot || '{}');
            if (Object.keys(snapshot).length > 0) return { data: snapshot, backed_up_at: data.data.backed_up_at };
        } catch(e) {}
    }
    const { data: hist, error: histErr } = await _supabase
        .from('item_history')
        .select('snapshot, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    if (!histErr && hist && hist.snapshot) {
        return { data: hist.snapshot, backed_up_at: hist.created_at };
    }
    return { error: 'No backup found' };
}

async function getItemHistory(limit = 10) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('item_history')
        .select('id, created_at, snapshot')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
    return error ? { error } : { data };
}
