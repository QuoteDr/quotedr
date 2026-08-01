// QuoteDr product analytics.
// Uses the public PostHog browser token only; never put a private phx_ API key here.
(function(window, document) {
    'use strict';

    var POSTHOG_TOKEN = 'phc_yXxbouoPwjD2ce8uchnRYcJ72DvUEwysGgJkCsHPFDgN';
    var POSTHOG_API_HOST = 'https://us.i.posthog.com';
    var POSTHOG_UI_HOST = 'https://us.posthog.com';
    var DISABLE_KEY = 'quotedr_analytics_opt_out';
    var ONCE_PREFIX = 'quotedr_analytics_once:';
    var CANONICAL_ORIGIN = 'https://quotedr.io';
    var SENSITIVE_KEY_RE = /(email|phone|address|client|customer|name|signature|message|note|notes|description|url|link|token|key|password|pin)/i;
    var EVENT_SENSITIVE_KEY_RE = /(email|phone|address|client|customer|signature|message|note|notes|description|token|password|pin|query|search|hash)/i;
    var BOT_RE = /(bot|crawler|spider|headless|lighthouse|pagespeed|preview|slurp|facebookexternalhit|whatsapp|bingpreview|uptimerobot)/i;
    var MARKETING_ROUTES = {
        '/landing': true,
        '/about': true,
        '/contact': true,
        '/pricing': true,
        '/tutorials': true,
        '/whats-new': true,
        '/blog': true,
        '/terms': true,
        '/privacy': true
    };

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

    function isKnownBot(userAgent) {
        return BOT_RE.test(String(userAgent || ''));
    }

    function isAnalyticsHostAllowed(hostname) {
        var host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
        return host === 'quotedr.io' || host === 'www.quotedr.io';
    }

    function isAvailable() {
        var hostname = window.location && window.location.hostname;
        var userAgent = window.navigator && window.navigator.userAgent;
        return isAnalyticsHostAllowed(hostname) && !isKnownBot(userAgent) && !isDisabled();
    }

    function safePathSegment(segment) {
        var decoded = String(segment || '');
        try { decoded = decodeURIComponent(decoded); } catch(e) {}
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded)) return ':id';
        if (/^\d{8,}$/.test(decoded)) return ':id';
        if (/^[A-Za-z0-9_-]{24,}$/.test(decoded)) return ':id';
        return decoded.replace(/[^A-Za-z0-9._~-]/g, '-').slice(0, 64);
    }

    function safeRoute(pathname) {
        var path = String(pathname === undefined
            ? ((window.location && window.location.pathname) || '/')
            : pathname);
        path = path.split('?')[0].split('#')[0].replace(/\\/g, '/');
        var parts = path.split('/').filter(Boolean).map(safePathSegment);
        var route = '/' + parts.join('/');
        route = route.replace(/\/(index\.html|index)$/i, '');
        route = route.replace(/\.html$/i, '');
        route = route.replace(/\/{2,}/g, '/');
        if (route === '/' || route === '') route = '/landing';
        if (route === '/blog/') route = '/blog';
        return route.slice(0, 120);
    }

    function isMarketingRoute(route) {
        route = safeRoute(route);
        return !!MARKETING_ROUTES[route] || route.indexOf('/blog/') === 0;
    }

    function siteArea(route) {
        route = safeRoute(route);
        if (isMarketingRoute(route)) return 'marketing';
        if (route === '/interactive-quote-viewer' || route === '/invoice-viewer' || route === '/client-portal') return 'client';
        return 'app';
    }

    function safePageName(pathname) {
        var route = safeRoute(pathname);
        if (route === '/landing') return 'landing';
        return route.replace(/^\//, '').replace(/\//g, ':') || 'landing';
    }

    function safeReferrerDomain(value) {
        var raw = String(value || '').trim();
        if (!raw) return 'direct';
        try {
            var parsed = new URL(raw, CANONICAL_ORIGIN);
            var hostname = String(parsed.hostname || '').toLowerCase().replace(/^www\./, '');
            if (!hostname) return 'direct';
            return hostname === 'quotedr.io' ? 'quotedr.io' : hostname.slice(0, 120);
        } catch(e) {
            var fallback = raw.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '');
            return fallback.slice(0, 120) || 'direct';
        }
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
        var route = safeRoute();
        var area = siteArea(route);
        clean.app = 'quotedr';
        clean.page = safePageName(route);
        clean.route = route;
        clean.site_area = area;
        clean.audience = area === 'marketing' ? 'visitor' : 'member';
        var plan = currentPlan();
        if (plan) clean.plan = plan;
        return clean;
    }

    function sanitizeUrlValue(value) {
        try {
            var parsed = new URL(String(value || ''), CANONICAL_ORIGIN);
            return CANONICAL_ORIGIN + safeRoute(parsed.pathname);
        } catch(e) {
            return CANONICAL_ORIGIN + safeRoute();
        }
    }

    function sanitizePostHogEvent(event) {
        if (!event || typeof event !== 'object' || !isAvailable()) return null;
        var route = safeRoute();
        var area = siteArea(route);
        var properties = Object.assign({}, event.properties || {});

        Object.keys(properties).forEach(function(key) {
            if (EVENT_SENSITIVE_KEY_RE.test(key)) delete properties[key];
        });

        properties.$current_url = sanitizeUrlValue(properties.$current_url || CANONICAL_ORIGIN + route);
        properties.$pathname = route;
        properties.$host = 'quotedr.io';
        delete properties.$initial_current_url;
        delete properties.$referrer;
        delete properties.$initial_referrer;
        delete properties.$search_engine;
        delete properties.$set;
        delete properties.$set_once;

        var referrerDomain = safeReferrerDomain(properties.referrer_domain || properties.$referring_domain || document.referrer);
        properties.$referring_domain = referrerDomain;
        properties.referrer_domain = referrerDomain;
        properties.route = route;
        properties.site_area = area;
        properties.audience = area === 'marketing' ? 'visitor' : (properties.audience || 'member');
        properties.app = 'quotedr';

        if (area === 'marketing') {
            delete properties.$elements;
            delete properties.$element_id;
            delete properties.$element_text;
            delete properties.$element_class;
            delete properties.$element_href;
        }

        event.properties = properties;
        return event;
    }

    function ensurePostHogStub() {
        if (window.posthog && window.posthog.__SV) return;
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=(s.api_host||POSTHOG_API_HOST).replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify alias set_config reset people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user group identify preloadFeatureFlags isFeatureEnabled getFeatureFlag onFeatureFlags reloadFeatureFlags getFeatureFlagPayload captureException startSessionRecording stopSessionRecording get_session_id get_distinct_id debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    }

    function init() {
        if (!POSTHOG_TOKEN || !isAvailable()) return;
        ensurePostHogStub();
        if (!window.posthog || window.posthog.__quotedrInitialized) return;
        window.posthog.__quotedrInitialized = true;
        window.posthog.init(POSTHOG_TOKEN, {
            api_host: POSTHOG_API_HOST,
            ui_host: POSTHOG_UI_HOST,
            before_send: sanitizePostHogEvent,
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
            custom_blocked_useragents: [BOT_RE],
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
        if (!name || !isAvailable()) return;
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
        if (!user || !user.id || !isAvailable()) return;
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
        isDisabled: isDisabled,
        isAvailable: isAvailable,
        _test: {
            safeRoute: safeRoute,
            siteArea: siteArea,
            safeReferrerDomain: safeReferrerDomain,
            sanitizeProperties: sanitizeProperties,
            sanitizePostHogEvent: sanitizePostHogEvent,
            isAnalyticsHostAllowed: isAnalyticsHostAllowed,
            isKnownBot: isKnownBot
        }
    };

    init();
    if (isAvailable()) {
        var route = safeRoute();
        var page = safePageName(route);
        capture('page_viewed', { referrer_domain: safeReferrerDomain(document.referrer) });
        var openEvents = {
            'dashboard': 'dashboard_opened',
            'quote-builder': 'quote_builder_opened',
            'settings': 'settings_opened',
            'home-depot-tracker': 'job_tracker_opened',
            'invoice-viewer': 'invoice_viewed',
            'interactive-quote-viewer': 'quote_client_viewed',
            'onboarding': 'onboarding_opened',
            'pricing': 'pricing_opened',
            'contact': 'contact_opened'
        };
        if (openEvents[page]) capture(openEvents[page], { referrer_domain: safeReferrerDomain(document.referrer) });
    }
})(window, document);
