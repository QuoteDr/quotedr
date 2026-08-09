(function(global) {
    'use strict';

    var PERMISSIONS = Object.freeze({
        ACCOUNT_READ: 'account.read',
        TEAM_READ: 'team.read',
        TEAM_MANAGE: 'team.manage',
        ROLES_MANAGE: 'roles.manage',
        BUSINESS_READ: 'business.read',
        BUSINESS_MANAGE: 'business.manage',
        SETTINGS_MANAGE: 'settings.manage',
        QUOTES_READ: 'quotes.read',
        QUOTES_CREATE: 'quotes.create',
        QUOTES_UPDATE: 'quotes.update',
        QUOTES_DELETE: 'quotes.delete',
        QUOTES_SEND: 'quotes.send',
        QUOTES_PRICING_READ: 'quotes.pricing.read',
        QUOTES_PRICING_MANAGE: 'quotes.pricing.manage',
        ITEMS_READ: 'items.read',
        ITEMS_MANAGE: 'items.manage',
        ITEMS_PRICING_READ: 'items.pricing.read',
        CLIENTS_READ: 'clients.read',
        CLIENTS_MANAGE: 'clients.manage',
        CLIENTS_DELETE: 'clients.delete',
        TEMPLATES_READ: 'templates.read',
        TEMPLATES_MANAGE: 'templates.manage',
        PAYMENTS_READ: 'payments.read',
        PAYMENTS_MANAGE: 'payments.manage',
        BILLING_READ: 'billing.read',
        BILLING_MANAGE: 'billing.manage',
        INTEGRATIONS_MANAGE: 'integrations.manage',
        LABOR_READ: 'labor.read',
        LABOR_MANAGE: 'labor.manage',
        ANALYTICS_READ: 'analytics.read'
    });

    var state = {
        user: null,
        accounts: [],
        active: null,
        ready: false,
        error: null
    };
    var readyPromise = null;
    var CACHE_PRINCIPAL_KEY = 'quotedr_cache_principal';
    var CACHE_PENDING_PRINCIPAL = 'pending';
    var CACHE_SAFE_LOCAL_KEYS = Object.freeze({
        ald_remember_me: true,
        ald_remembered_email: true,
        ald_tagline_idx: true,
        ald_tagline_order: true,
        quotedr_durable_save_enabled: true
    });
    var CACHE_SAFE_SESSION_KEYS = Object.freeze({
        ald_lockout_until: true,
        ald_login_attempts: true,
        quotedr_pending_invite_token: true
    });
    var ACCOUNT_API_MESSAGES = Object.freeze({
        invalid_role_request: 'Enter valid role settings and try again.',
        invalid_role_id: 'This custom role is no longer available. Reload Team settings and try again.',
        invalid_role_name: 'Enter a role name between 1 and 80 characters.',
        invalid_role_description: 'Keep the role description under 300 characters.',
        role_name_taken: 'A role with this name already exists. Choose a different name or edit the existing role.',
        invalid_role_permissions: 'Review the selected capabilities and try again.',
        role_permission_dependency: 'A selected capability is missing a requirement. Reload Team settings and try again.',
        role_owner_only_permission: 'This capability is reserved for the account owner. Remove it and save again.',
        invalid_role_fields: 'Review the field privacy settings and try again.',
        role_field_view_required: 'A visible field is missing its matching view capability. Reload Team settings and try again.',
        role_field_edit_required: 'An editable field is missing its matching edit capability. Reload Team settings and try again.',
        role_not_found: 'This custom role no longer exists. Reload Team settings and try again.',
        role_in_use: 'Reassign members before archiving this role.',
        role_invitation_pending: 'Revoke pending invitations before archiving this role.',
        permission_denied: 'You do not have permission to complete this account action.',
        authentication_required: 'Your session has expired. Sign in and try again.',
        account_required: 'Choose an account and try again.',
        service_unavailable: 'The account service is temporarily unavailable. Try again shortly.'
    });

    function accountSupportId(value) {
        value = String(value || '').trim();
        return /^[A-Z0-9-]{4,32}$/i.test(value) ? value.toUpperCase() : '';
    }

    function accountApiMessage(code, supportId) {
        var message = ACCOUNT_API_MESSAGES[String(code || '')]
            || 'The account request could not be completed. Please try again.';
        var reference = accountSupportId(supportId);
        return reference ? message + ' Reference ' + reference + '.' : message;
    }

    async function accountApiError(result) {
        var invokeError = result && result.error;
        var payload = result && result.data && typeof result.data === 'object' ? result.data : null;
        if ((!payload || !payload.code) && invokeError && invokeError.context && typeof invokeError.context.json === 'function') {
            try {
                var contextPayload = await invokeError.context.json();
                if (contextPayload && typeof contextPayload === 'object') payload = contextPayload;
            } catch (_) {}
        }
        var code = payload && typeof payload.code === 'string' ? payload.code : '';
        if (!code && invokeError && /Functions(?:Fetch|Relay)Error/.test(String(invokeError.name || ''))) {
            code = 'account_network_error';
        }
        var error = new Error(code === 'account_network_error'
            ? 'The account service could not be reached. Check your connection and try again.'
            : accountApiMessage(code, payload && payload.supportId));
        error.code = code || 'account_request_failed';
        error.supportId = accountSupportId(payload && payload.supportId);
        return error;
    }

    function cachePrincipalUserId(principal) {
        var value = String(principal || '');
        var separator = value.indexOf(':');
        return separator === -1 ? value : value.slice(0, separator);
    }

    function cachePrincipal(user, account) {
        if (!user || !user.id) return 'signed-out';
        if (!account) return String(user.id) + ':' + CACHE_PENDING_PRINCIPAL;
        var capabilityFingerprint = Array.isArray(account.permissions)
            ? account.permissions.slice().sort().join(',')
            : '';
        var fieldFingerprint = account.fields && typeof account.fields === 'object'
            ? Object.keys(account.fields).sort().map(function(key) { return key + '=' + account.fields[key]; }).join(',')
            : '';
        return [user.id, account.accountId || 'legacy', capabilityFingerprint, fieldFingerprint].join(':');
    }

    function isSupabaseAuthStorageKey(key) {
        return /^sb-[a-z0-9]+-auth-token(?:\.|$)/i.test(String(key || ''));
    }

    function accountAuthStorageKey() {
        var client = global._supabaseClient || global._supabase;
        var configured = client && client.auth && client.auth.storageKey;
        if (typeof configured === 'string' && configured) return configured;
        try {
            var host = new URL(String(client && client.supabaseUrl || '')).hostname;
            var projectRef = host.split('.')[0];
            return projectRef ? 'sb-' + projectRef + '-auth-token' : '';
        } catch (_) {
            return '';
        }
    }

    function storedSessionUserId() {
        try {
            var key = accountAuthStorageKey();
            if (!key || !isSupabaseAuthStorageKey(key)) return '';
            var stored = JSON.parse(global.localStorage.getItem(key) || 'null');
            var candidates = [stored, stored && stored.currentSession, stored && stored.session];
            if (Array.isArray(stored)) candidates.push(stored[0]);
            for (var index = 0; index < candidates.length; index++) {
                var candidate = candidates[index];
                var user = candidate && (candidate.user || candidate.session && candidate.session.user);
                if (user && user.id) return String(user.id);
            }
        } catch (_) {}
        return '';
    }

    function isAccountLocalStorageKey(key) {
        key = String(key || '');
        if (!key || CACHE_SAFE_LOCAL_KEYS[key] || key === CACHE_PRINCIPAL_KEY || isSupabaseAuthStorageKey(key)) return false;
        return key.indexOf('ald_') === 0
            || key.indexOf('quotedr_') === 0
            || key.indexOf('portal-theme-') === 0
            || key.indexOf('invoice_') === 0
            || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    }

    function isAccountSessionStorageKey(key) {
        key = String(key || '');
        if (!key || CACHE_SAFE_SESSION_KEYS[key]) return false;
        return key.indexOf('ald_') === 0
            || key.indexOf('quotedr_') === 0
            || key.indexOf('invoice_') === 0;
    }

    function removeMatchingStorage(storage, predicate) {
        if (!storage) return;
        var keys = [];
        try {
            for (var index = 0; index < storage.length; index++) keys.push(storage.key(index));
            keys.filter(predicate).forEach(function(key) { storage.removeItem(key); });
        } catch (_) {}
    }

    function clearDurableAccountCache() {
        try {
            if (!global.indexedDB) return;
            var request = global.indexedDB.deleteDatabase('quotedr-durable-saves');
            request.onerror = function() {
                console.warn('QuoteDr could not clear the previous account durable-save cache.');
            };
        } catch (_) {}
    }

    function protectAccountCache(user, account) {
        var nextPrincipal = cachePrincipal(user, account);
        var previousPrincipal = '';
        try { previousPrincipal = localStorage.getItem(CACHE_PRINCIPAL_KEY) || ''; } catch (_) {}
        var pendingForSameUser = !!(
            user && user.id
            && previousPrincipal === String(user.id) + ':' + CACHE_PENDING_PRINCIPAL
        );
        var bootstrapOwnedAccount = !!(
            pendingForSameUser
            && account
            && account.ownerUserId === user.id
        );
        var firstKnownSharedAccount = !!(
            !previousPrincipal
            && user && user.id
            && account && account.accountId
            && account.ownerUserId !== user.id
        );
        var shouldClear = firstKnownSharedAccount
            || (!!previousPrincipal && previousPrincipal !== nextPrincipal && !bootstrapOwnedAccount);
        if (shouldClear) {
            removeMatchingStorage(global.localStorage, isAccountLocalStorageKey);
            removeMatchingStorage(global.sessionStorage, isAccountSessionStorageKey);
            clearDurableAccountCache();
        }
        try {
            localStorage.setItem(CACHE_PRINCIPAL_KEY, nextPrincipal);
            if (account && account.accountId) localStorage.setItem('quotedr_active_account_id', account.accountId);
            else localStorage.removeItem('quotedr_active_account_id');
        } catch (_) {}
        return nextPrincipal;
    }

    function protectAuthTransition(event, session) {
        var user = session && session.user;
        var previousPrincipal = '';
        try { previousPrincipal = localStorage.getItem(CACHE_PRINCIPAL_KEY) || ''; } catch (_) {}
        if (!user && (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION')) {
            protectAccountCache(null, null);
            return;
        }
        if (user && cachePrincipalUserId(previousPrincipal) !== String(user.id)) {
            protectAccountCache(user, null);
        }
    }

    function protectStoredSessionBoundary() {
        var userId = storedSessionUserId();
        var previousPrincipal = '';
        try { previousPrincipal = localStorage.getItem(CACHE_PRINCIPAL_KEY) || ''; } catch (_) {}
        if (userId && previousPrincipal && cachePrincipalUserId(previousPrincipal) !== userId) {
            protectAccountCache({ id: userId }, null);
        }
    }

    function allPermissions() {
        return Object.keys(PERMISSIONS).map(function(key) { return PERMISSIONS[key]; });
    }

    function permissionSet(account) {
        return new Set(account && Array.isArray(account.permissions) ? account.permissions : []);
    }

    function chooseAccount(accounts, user) {
        var selectedId = '';
        try { selectedId = localStorage.getItem('quotedr_active_account_id') || ''; } catch (_) {}
        var selected = accounts.find(function(account) { return account.accountId === selectedId; });
        if (!selected && user) {
            selected = accounts.find(function(account) { return account.ownerUserId === user.id; });
        }
        return selected || accounts[0] || null;
    }

    function legacyOwnerContext(user) {
        return {
            accountId: null,
            ownerUserId: user && user.id || null,
            name: 'My company',
            role: { key: 'owner', name: 'Owner' },
            permissions: allPermissions(),
            fields: null,
            legacy: true
        };
    }

    async function loadContext() {
        var client = global._supabaseClient || global._supabase;
        if (!client) throw new Error('Supabase client is unavailable');
        var sessionResult = await client.auth.getSession();
        var user = sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
        state.user = user || null;
        if (!user) {
            state.accounts = [];
            state.active = null;
            protectAccountCache(null, null);
            state.ready = true;
            return state;
        }
        var result = await client.functions.invoke('team-account', { body: { action: 'context' } });
        if (result.error || !result.data || !result.data.data) {
            state.accounts = [legacyOwnerContext(user)];
            state.active = state.accounts[0];
            state.error = result.error || new Error('Account context unavailable');
        } else {
            state.user = result.data.data.user || user;
            state.accounts = Array.isArray(result.data.data.accounts) ? result.data.data.accounts : [];
            state.active = chooseAccount(state.accounts, state.user);
            state.error = null;
        }
        protectAccountCache(state.user, state.active);
        state.ready = true;
        applyDocumentAccess();
        global.dispatchEvent(new CustomEvent('quotedr-account-ready', { detail: snapshot() }));
        return state;
    }

    function init(options) {
        if (options && options.force) readyPromise = null;
        if (!readyPromise) {
            readyPromise = loadContext().catch(function(error) {
                state.error = error;
                state.ready = true;
                return state;
            });
        }
        return readyPromise;
    }

    function activeAccount() {
        return state.active;
    }

    function can(permission) {
        if (!permission) return true;
        return permissionSet(state.active).has(permission);
    }

    function fieldAccess(fieldKey) {
        var account = state.active;
        if (!account || account.legacy || account.fields == null) return 'write';
        var level = account.fields && account.fields[fieldKey];
        return level === 'write' ? 'write' : level === 'read' ? 'read' : 'hidden';
    }

    function canReadField(fieldKey) {
        var level = fieldAccess(fieldKey);
        return level === 'read' || level === 'write';
    }

    function canWriteField(fieldKey) {
        return fieldAccess(fieldKey) === 'write';
    }

    function usesTeamApi() {
        return !!(
            state.user
            && state.active
            && state.active.accountId
            && state.active.ownerUserId !== state.user.id
        );
    }

    function ownerUserId() {
        return state.active && state.active.ownerUserId || state.user && state.user.id || null;
    }

    function isOwner() {
        return !!(state.user && state.active && state.active.ownerUserId === state.user.id);
    }

    function snapshot() {
        return {
            user: state.user,
            accounts: state.accounts.slice(),
            active: state.active,
            ready: state.ready,
            error: state.error,
            teamApi: usesTeamApi()
        };
    }

    async function api(action, payload) {
        await init();
        if (!state.active || !state.active.accountId) throw new Error('Account access is not ready');
        var client = global._supabaseClient || global._supabase;
        var body = Object.assign({}, payload || {}, {
            action: action,
            accountId: state.active.accountId
        });
        var result = await client.functions.invoke('team-account', { body: body });
        if (result.error) {
            throw await accountApiError(result);
        }
        if (result.data && result.data.error) {
            throw await accountApiError(result);
        }
        return result.data || {};
    }

    function setActiveAccount(accountId) {
        var next = state.accounts.find(function(account) { return account.accountId === accountId; });
        if (!next) return false;
        protectAccountCache(state.user, next);
        state.active = next;
        try { localStorage.setItem('quotedr_active_account_id', next.accountId); } catch (_) {}
        applyDocumentAccess();
        global.dispatchEvent(new CustomEvent('quotedr-account-changed', { detail: snapshot() }));
        return true;
    }

    function applyDocumentAccess(root) {
        if (typeof document === 'undefined') return;
        var scope = root || document;
        var nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-account-permission]') : [];
        Array.prototype.forEach.call(nodes, function(node) {
            var required = String(node.getAttribute('data-account-permission') || '')
                .split(/[\s,]+/)
                .filter(Boolean);
            var allowed = required.every(can);
            if (!allowed) {
                node.hidden = true;
                node.setAttribute('data-account-access-hidden', 'true');
            } else if (node.getAttribute('data-account-access-hidden') === 'true') {
                node.hidden = false;
                node.removeAttribute('data-account-access-hidden');
            }
        });
        var ownerNodes = scope.querySelectorAll ? scope.querySelectorAll('[data-account-owner-only]') : [];
        Array.prototype.forEach.call(ownerNodes, function(node) {
            if (!isOwner()) {
                node.hidden = true;
                node.setAttribute('data-account-owner-hidden', 'true');
            } else if (node.getAttribute('data-account-owner-hidden') === 'true') {
                node.removeAttribute('data-account-owner-hidden');
                if (node.getAttribute('data-account-access-hidden') !== 'true') node.hidden = false;
            }
        });
        var fieldNodes = scope.querySelectorAll ? scope.querySelectorAll('[data-account-field]') : [];
        Array.prototype.forEach.call(fieldNodes, function(node) {
            var fieldKey = String(node.getAttribute('data-account-field') || '');
            var needsWrite = node.getAttribute('data-account-field-access') === 'write';
            var readable = canReadField(fieldKey);
            if (!readable) {
                node.hidden = true;
                node.setAttribute('data-account-field-hidden', 'true');
                return;
            }
            if (node.getAttribute('data-account-field-hidden') === 'true') {
                node.hidden = false;
                node.removeAttribute('data-account-field-hidden');
            }
            if (needsWrite) {
                var controls = 'disabled' in node
                    ? [node]
                    : Array.prototype.slice.call(node.querySelectorAll ? node.querySelectorAll('input, textarea, select, button') : []);
                controls.forEach(function(control) {
                    if (!canWriteField(fieldKey)) {
                        if (!control.disabled) control.setAttribute('data-account-field-disabled', 'true');
                        control.disabled = true;
                        control.setAttribute('aria-disabled', 'true');
                    } else if (control.getAttribute('data-account-field-disabled') === 'true') {
                        control.disabled = false;
                        control.removeAttribute('aria-disabled');
                        control.removeAttribute('data-account-field-disabled');
                    }
                });
            }
        });
        if (document.body) {
            document.body.classList.toggle('qd-shared-account', usesTeamApi());
            document.body.classList.toggle('qd-no-pricing-access', !can(PERMISSIONS.QUOTES_PRICING_READ));
            document.body.classList.toggle('qd-no-send-access', !can(PERMISSIONS.QUOTES_SEND));
            document.body.classList.toggle('qd-no-payment-access', !can(PERMISSIONS.PAYMENTS_READ));
            document.body.classList.toggle('qd-no-team-management', !can(PERMISSIONS.TEAM_MANAGE));
            document.body.classList.toggle('qd-account-owner', isOwner());
        }
    }

    function installAccessStyles() {
        if (typeof document === 'undefined' || document.getElementById('quotedrAccountAccessStyles')) return;
        var style = document.createElement('style');
        style.id = 'quotedrAccountAccessStyles';
        style.textContent = `
            .qd-no-pricing-access .quote-item-markup-badge,
            .qd-no-pricing-access .quote-item-profit-cell,
            .qd-no-pricing-access .manage-margin-pill,
            .qd-no-pricing-access .property-memory-markup-section,
            .qd-no-pricing-access .markup-client-warning,
            .qd-no-pricing-access .btn-markup,
            .qd-no-pricing-access [id^='markupControls_'],
            .qd-no-pricing-access [id*='MaterialCost'],
            .qd-no-pricing-access [id*='SupplierUrl'],
            .qd-no-pricing-access [data-bs-target='#materialCostCollapse'],
            .qd-no-pricing-access [data-bs-target='#profitReport'],
            .qd-no-pricing-access #materialCostCollapse,
            .qd-no-pricing-access #profitReport,
            .qd-no-pricing-access [onclick*='Markup'],
            .qd-no-pricing-access [onclick*='markup'],
            .qd-no-send-access [onclick*='sendQuote'],
            .qd-no-send-access [onclick*='sendInvoice'],
            .qd-no-send-access [onclick*='FollowUpReminder'],
            .qd-no-send-access [onclick*='ReviewRequest'],
            .qd-no-send-access [onclick*='SecureClientShareLink'] { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    global.QuoteDrAccount = Object.freeze({
        PERMISSIONS: PERMISSIONS,
        init: init,
        can: can,
        fieldAccess: fieldAccess,
        canReadField: canReadField,
        canWriteField: canWriteField,
        api: api,
        active: activeAccount,
        snapshot: snapshot,
        ownerUserId: ownerUserId,
        isOwner: isOwner,
        usesTeamApi: usesTeamApi,
        setActiveAccount: setActiveAccount,
        applyDocumentAccess: applyDocumentAccess
    });

    installAccessStyles();
    protectStoredSessionBoundary();
    if (global._supabase && global._supabase.auth) {
        global._supabase.auth.onAuthStateChange(function(event, session) {
            protectAuthTransition(event, session);
            state.ready = false;
            readyPromise = null;
            global.setTimeout(function() { init(); }, 0);
        });
    }
    init();
})(typeof window !== 'undefined' ? window : globalThis);
