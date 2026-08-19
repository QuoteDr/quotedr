(function(global) {
    'use strict';

    var STORAGE_KEY = 'ald_document_numbering';
    var DEFAULTS = Object.freeze({
        version: 1,
        companyCode: '',
        companyCodePosition: 'suffix',
        formatStyle: 'document_first',
        yearStyle: 'four_digit',
        clientPadding: 4,
        sequencePadding: 3,
        documentCodes: Object.freeze({ quote: 'Q', invoice: 'I', change_order: 'CO', revision: 'R' })
    });
    var cachedSettings = null;
    var cachedConfigured = false;

    function record(value) {
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    function boundedInteger(value, fallback, minimum, maximum) {
        var parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
    }

    function cleanCompanyCode(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    }

    function legacySettings() {
        var prefs = {};
        try { prefs = JSON.parse(localStorage.getItem('ald_quote_prefs') || '{}') || {}; } catch (_) {}
        var code = prefs.showPrefix === false ? '' : cleanCompanyCode(prefs.prefix || '');
        return {
            companyCode: code,
            companyCodePosition: code ? 'prefix' : 'none'
        };
    }

    function normalize(value, options) {
        var source = record(value);
        var legacy = options && options.useLegacy === false ? {} : legacySettings();
        var companyCode = cleanCompanyCode(
            Object.prototype.hasOwnProperty.call(source, 'companyCode') ? source.companyCode : legacy.companyCode
        );
        var requestedPosition = String(
            Object.prototype.hasOwnProperty.call(source, 'companyCodePosition')
                ? source.companyCodePosition
                : legacy.companyCodePosition || DEFAULTS.companyCodePosition
        ).toLowerCase();
        var companyCodePosition = ['prefix', 'suffix', 'none'].includes(requestedPosition)
            ? requestedPosition
            : DEFAULTS.companyCodePosition;
        var formatStyle = String(source.formatStyle || '').toLowerCase() === 'client_first'
            ? 'client_first'
            : DEFAULTS.formatStyle;
        var requestedYearStyle = String(source.yearStyle || '').toLowerCase();
        var yearStyle = ['four_digit', 'two_digit', 'none'].includes(requestedYearStyle)
            ? requestedYearStyle
            : DEFAULTS.yearStyle;
        return {
            version: 1,
            companyCode: companyCode,
            companyCodePosition: companyCode ? companyCodePosition : 'none',
            formatStyle: formatStyle,
            yearStyle: yearStyle,
            clientPadding: boundedInteger(source.clientPadding, DEFAULTS.clientPadding, 2, 8),
            sequencePadding: boundedInteger(source.sequencePadding, DEFAULTS.sequencePadding, 2, 8),
            documentCodes: Object.assign({}, DEFAULTS.documentCodes)
        };
    }

    function pad(value, width) {
        return String(Math.max(0, parseInt(value, 10) || 0)).padStart(width, '0');
    }

    function documentCode(documentType) {
        return DEFAULTS.documentCodes[String(documentType || 'quote').toLowerCase()] || DEFAULTS.documentCodes.quote;
    }

    function format(settings, values) {
        settings = normalize(settings, { useLegacy: false });
        values = values || {};
        var type = String(values.documentType || 'quote').toLowerCase();
        var year = boundedInteger(values.year, new Date().getFullYear(), 2000, 9999);
        var yearToken = settings.yearStyle === 'none'
            ? ''
            : (settings.yearStyle === 'two_digit' ? String(year).slice(-2) : String(year));
        var clientToken = 'C' + pad(values.clientNumber || 1, settings.clientPadding);
        var parts = settings.formatStyle === 'client_first'
            ? [clientToken, documentCode(type)]
            : [documentCode(type)];
        if (yearToken) parts.push(yearToken);
        if (settings.formatStyle !== 'client_first') parts.push(clientToken);
        parts.push(pad(values.sequence || 1, settings.sequencePadding));
        if (settings.companyCode && settings.companyCodePosition === 'prefix') parts.unshift(settings.companyCode);
        if (settings.companyCode && settings.companyCodePosition === 'suffix') parts.push(settings.companyCode);
        return parts.join('-');
    }

    function clientLabel(value, settings) {
        settings = normalize(settings || current(), { useLegacy: false });
        var number = parseInt(value, 10);
        return Number.isFinite(number) && number > 0 ? 'C' + pad(number, settings.clientPadding) : '';
    }

    function readLocal() {
        try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
        catch (_) { return normalize({}); }
    }

    function writeLocal(settings, configured) {
        cachedSettings = normalize(settings, { useLegacy: false });
        cachedConfigured = configured !== false;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSettings)); } catch (_) {}
        global.dispatchEvent(new CustomEvent('quotedr-numbering-settings', {
            detail: { settings: cachedSettings, configured: cachedConfigured }
        }));
        return cachedSettings;
    }

    function current() {
        if (!cachedSettings) cachedSettings = readLocal();
        return normalize(cachedSettings, { useLegacy: false });
    }

    async function load(options) {
        options = options || {};
        if (cachedSettings && !options.force) {
            return { settings: current(), configured: cachedConfigured };
        }
        var local = readLocal();
        if (!global.QuoteDrAccount || typeof global.QuoteDrAccount.api !== 'function') {
            cachedSettings = local;
            return { settings: local, configured: false, localOnly: true };
        }
        try {
            var response = await global.QuoteDrAccount.api('numbering.get');
            var data = response && response.data || {};
            var settings = data.configured === false ? normalize(local) : normalize(data.settings, { useLegacy: false });
            writeLocal(settings, data.configured === true);
            return { settings: settings, configured: data.configured === true };
        } catch (error) {
            cachedSettings = local;
            return { settings: local, configured: false, localOnly: true, error: error };
        }
    }

    async function save(settings) {
        var normalized = normalize(settings, { useLegacy: false });
        if (!global.QuoteDrAccount || typeof global.QuoteDrAccount.api !== 'function') {
            throw new Error('Account settings are unavailable. Sign in and try again.');
        }
        var response = await global.QuoteDrAccount.api('numbering.save', { settings: normalized });
        var saved = response && response.data && response.data.settings || normalized;
        return writeLocal(saved, true);
    }

    async function reserve(documentType, client) {
        if (!global.QuoteDrAccount || typeof global.QuoteDrAccount.api !== 'function') {
            throw new Error('QuoteDr could not reach the account numbering service.');
        }
        var response = await global.QuoteDrAccount.api('numbering.reserve', {
            documentType: documentType,
            documentYear: new Date().getFullYear(),
            client: record(client)
        });
        var data = response && response.data || null;
        if (!data || !data.documentNumber) throw new Error('QuoteDr could not reserve a document number.');
        if (data.settings) writeLocal(data.settings, true);
        return data;
    }

    async function ensureClient(client) {
        if (!global.QuoteDrAccount || typeof global.QuoteDrAccount.api !== 'function') {
            throw new Error('QuoteDr could not reach the account client-number service.');
        }
        var response = await global.QuoteDrAccount.api('numbering.client', { client: record(client) });
        var data = response && response.data || null;
        if (!data || !data.client || !data.client.clientNumber) {
            throw new Error('QuoteDr could not assign the client number.');
        }
        return data;
    }

    global.QuoteDrDocumentNumbers = Object.freeze({
        defaults: DEFAULTS,
        normalize: normalize,
        format: format,
        clientLabel: clientLabel,
        current: current,
        load: load,
        save: save,
        ensureClient: ensureClient,
        reserve: reserve,
        cleanCompanyCode: cleanCompanyCode
    });
})(window);
