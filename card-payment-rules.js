(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QuoteDrCardPaymentRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    var DOCUMENT_RULE_VERSION = 1;

    function finiteNumber(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeMode(value) {
        return value === 'offer' || value === 'disable' ? value : 'auto';
    }

    function normalizeSettings(settings) {
        settings = settings && typeof settings === 'object' ? settings : {};
        var thresholdCents = Math.max(0, Math.round(finiteNumber(
            settings.card_payment_threshold_cents !== undefined
                ? settings.card_payment_threshold_cents
                : settings.cardPaymentThresholdCents,
            0
        )));
        var bufferPercent = Math.max(0, Math.min(100, finiteNumber(
            settings.card_payment_buffer_pct !== undefined
                ? settings.card_payment_buffer_pct
                : settings.cardPaymentBufferPct,
            0
        )));
        return {
            stripeEnabled: settings.stripe_enabled === true || settings.stripeEnabled === true,
            rule: settings.card_payment_rule === 'threshold' || settings.cardPaymentRule === 'threshold'
                ? 'threshold'
                : 'always',
            thresholdCents: thresholdCents,
            promptEnabled: settings.card_payment_prompt_enabled === true || settings.cardPaymentPromptEnabled === true,
            bufferPercent: bufferPercent
        };
    }

    function qualifies(settings, totalCents) {
        var normalized = normalizeSettings(settings);
        if (!normalized.stripeEnabled) return false;
        if (normalized.rule === 'always') return true;
        var total = Math.max(0, Math.round(finiteNumber(totalCents, 0)));
        return normalized.thresholdCents > 0 && total >= normalized.thresholdCents;
    }

    function buildDecision(settings, totalCents, requestedMode) {
        var normalized = normalizeSettings(settings);
        var mode = normalizeMode(requestedMode);
        var qualified = qualifies(settings, totalCents);
        var enabled = false;
        var source = 'below_threshold';

        if (!normalized.stripeEnabled) {
            source = 'account_disabled';
        } else if (mode === 'offer') {
            enabled = true;
            source = 'manual_offer';
        } else if (mode === 'disable') {
            source = 'manual_disable';
        } else if (qualified) {
            enabled = true;
            source = normalized.rule === 'threshold' ? 'account_threshold' : 'account_always';
        }

        return {
            version: DOCUMENT_RULE_VERSION,
            enabled: enabled,
            mode: mode,
            source: source,
            qualified: qualified,
            prompt: mode === 'auto' && qualified && normalized.promptEnabled,
            bufferPercent: normalized.bufferPercent,
            thresholdCents: normalized.thresholdCents,
            rule: normalized.rule
        };
    }

    function documentDecision(documentData) {
        if (!documentData || typeof documentData !== 'object') return null;
        var decision = documentData.card_payment || documentData.cardPayment;
        if (!decision || typeof decision !== 'object' || Number(decision.version || 0) < DOCUMENT_RULE_VERSION) return null;
        if (typeof decision.enabled !== 'boolean') return null;
        return {
            version: DOCUMENT_RULE_VERSION,
            enabled: decision.enabled,
            mode: normalizeMode(decision.mode),
            source: String(decision.source || 'document')
        };
    }

    function documentEnabled(settings, documentData) {
        var normalized = normalizeSettings(settings);
        if (!normalized.stripeEnabled) return false;
        var decision = documentDecision(documentData);
        return decision ? decision.enabled : true;
    }

    function snapshot(decision) {
        decision = decision || {};
        return {
            version: DOCUMENT_RULE_VERSION,
            enabled: decision.enabled === true,
            mode: normalizeMode(decision.mode),
            source: String(decision.source || 'document')
        };
    }

    function publicPaymentSettings(settings) {
        var result = Object.assign({}, settings && typeof settings === 'object' ? settings : {});
        [
            'card_payment_rule',
            'card_payment_threshold_cents',
            'card_payment_prompt_enabled',
            'card_payment_buffer_pct',
            'cardPaymentRule',
            'cardPaymentThresholdCents',
            'cardPaymentPromptEnabled',
            'cardPaymentBufferPct'
        ].forEach(function(key) { delete result[key]; });
        return result;
    }

    return {
        DOCUMENT_RULE_VERSION: DOCUMENT_RULE_VERSION,
        normalizeMode: normalizeMode,
        normalizeSettings: normalizeSettings,
        qualifies: qualifies,
        buildDecision: buildDecision,
        documentDecision: documentDecision,
        documentEnabled: documentEnabled,
        snapshot: snapshot,
        publicPaymentSettings: publicPaymentSettings
    };
});
