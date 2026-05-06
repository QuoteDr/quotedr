// QuoteDr product analytics.
// Uses the public PostHog browser token only; never put a private phx_ API key here.
(function(window, document) {
    'use strict';

    var POSTHOG_TOKEN = 'phc_yXxbouoPwjD2ce8uchnRYcJ72DvUEwysGgJkCsHPFDgN';
    var POSTHOG_API_HOST = 'https://us.i.posthog.com';
    var POSTHOG_UI_HOST = 'https://us.posthog.com';
    var POSTHOG_ASSET_HOST = 'https://us-assets.i.posthog.com';
    var DISABLE_KEY = 'quotedr_analytics_opt_out';
    var ONCE_PREFIX = 'quotedr_analytics_once:';

    var SENSITIVE_KEY_RE = /(email|phone|address|client|customer|name|signature|message|note|notes|description|url|link|token|key|password|pin)/i;

    function storageGet(key) {
        try { return window.localStorage ? window.localStorage.getItem(key) : null; } catch(e) { return null; }
    }

    function storageSet(key, value) {
        try { if (window.localStorage) window.localStorage.setItem(key, value); } catch(e) {}
    }

    function storageRemove(key) {
        try { if (window.localStorage) window.localStorage.removeItem(key); } catch(e) {}
    }

    function isDisabled() {
        var dnt = window.navigator && (window.navigator.doNotTrack || window.navigator.msDoNotTrack);
        return storageGet(DISABLE_KEY) === '1' || dnt === '1' || dnt === 'yes';
    }

    function safePageName() {
        var path = window.location && window.location.pathname ? window.location.pathname : '';
        var file = path.split('/').pop() || 'index.html';
        return file.replace(/\.html$/i, '') || 'home';
    }

    function currentPlan() {
        try {
            var sub = JSON.parse(storageGet('ald_subscription_status') || '{}');
            return sub && sub.plan ? String(sub.plan).toLowerCase() : undefined;
        } catch(e) {
            return undefined;
        }
    }

    function bucketMoney(value) {
        var amount = parseFloat(value) || 0;
        if (amount <= 0) return '0';
        if (amount < 500) return '<500';
        if (amount < 2500) return '500-2499';
        if (amount < 10000) return '2500-9999';
        if (amount < 25000) return '10000-24999';
        return '25000+';
    }

    function sanitizeProperties(props) {
        var clean = {};
        Object.keys(props || {}).forEach(function(key) {
            if (SENSITIVE_KEY_RE.test(key)) return;
            var value = props[key];
            if (value === undefined || typeof value === 'function') return;
            if (typeof value === 'string' && value.length > 120) value = value.slice(0, 120);
            if (typeof value === 'object' && value !== null) return;
            clean[key] = value;
        });
        clean.app = 'quotedr';
        clean.page = safePageName();
        var plan = currentPlan();
        if (plan) clean.plan = plan;
        return clean;
    }

    function ensurePostHogStub() {
        if (window.posthog && window.posthog.__SV) return;
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=(s.api_host||POSTHOG_API_HOST).replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify alias set_config reset people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user group identify preloadFeatureFlags isFeatureEnabled getFeatureFlag onFeatureFlags reloadFeatureFlags getFeatureFlagPayload captureException startSessionRecording stopSessionRecording get_session_id get_distinct_id debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    }

    function init() {
        if (!POSTHOG_TOKEN || isDisabled()) return;
        ensurePostHogStub();
        if (!window.posthog || window.posthog.__quotedrInitialized) return;
        window.posthog.__quotedrInitialized = true;
        window.posthog.init(POSTHOG_TOKEN, {
            api_host: POSTHOG_API_HOST,
            ui_host: POSTHOG_UI_HOST,
            loaded: function(posthog) {
                try {
                    posthog.set_config({
                        session_recording: {
                            maskAllInputs: true,
                            maskTextSelector: 'body',
                            blockClass: 'ph-no-capture',
                            blockSelector: '.ph-no-capture,[data-ph-no-capture]'
                        }
                    });
                } catch(e) {}
            },
            autocapture: true,
            capture_pageview: false,
            capture_pageleave: true,
            person_profiles: 'identified_only',
            mask_all_element_attributes: true,
            mask_all_text: true,
            session_recording: {
                maskAllInputs: true,
                maskTextSelector: 'body',
                blockClass: 'ph-no-capture',
                blockSelector: '.ph-no-capture,[data-ph-no-capture]'
            },
            defaults: '2025-05-24'
        });
    }

    function capture(name, props) {
        if (!name || isDisabled()) return;
        init();
        try {
            if (window.posthog && typeof window.posthog.capture === 'function') {
                window.posthog.capture(name, sanitizeProperties(props || {}));
            }
        } catch(e) {}
    }

    function captureOnce(name, key, props) {
        key = String(key || '');
        if (!key) {
            capture(name, props);
            return;
        }
        var storageKey = ONCE_PREFIX + name + ':' + key;
        if (storageGet(storageKey) === '1') return;
        storageSet(storageKey, '1');
        capture(name, props);
    }

    function identifyUser(user) {
        if (!user || !user.id || isDisabled()) return;
        init();
        try {
            if (window.posthog && typeof window.posthog.identify === 'function') {
                window.posthog.identify(user.id, {
                    app: 'quotedr',
                    user_type: 'contractor'
                });
            }
        } catch(e) {}
    }

    function reset() {
        try {
            if (window.posthog && typeof window.posthog.reset === 'function') window.posthog.reset();
        } catch(e) {}
    }

    function optOut() {
        storageSet(DISABLE_KEY, '1');
        reset();
    }

    function optIn() {
        storageRemove(DISABLE_KEY);
        init();
        capture('analytics_opted_in');
    }

    window.QuoteDrAnalytics = {
        capture: capture,
        captureOnce: captureOnce,
        identifyUser: identifyUser,
        reset: reset,
        optOut: optOut,
        optIn: optIn,
        bucketMoney: bucketMoney,
        isDisabled: isDisabled
    };

    init();
    if (!isDisabled()) {
        capture('page_viewed', { path: safePageName() });
        var openEvents = {
            'dashboard': 'dashboard_opened',
            'quote-builder': 'quote_builder_opened',
            'settings': 'settings_opened',
            'home-depot-tracker': 'job_tracker_opened',
            'invoice-viewer': 'invoice_viewed',
            'interactive-quote-viewer': 'quote_client_viewed',
            'onboarding': 'onboarding_opened',
            'pricing': 'pricing_opened'
        };
        var page = safePageName();
        if (openEvents[page]) capture(openEvents[page]);
    }
})(window, document);
