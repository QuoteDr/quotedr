// QuoteDr room and quote template import/export helpers.
(function(global) {
    'use strict';

    var TEMPLATE_FILE_VERSION = 1;
    var TEMPLATE_FILE_TYPE = 'quote-template-pack';

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value || null));
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function blankMoneyFields(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        ['rate', 'total', 'materialCost', 'laborCost', 'unit_rate', 'line_total', '_baseRate'].forEach(function(key) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) obj[key] = 0;
        });
        if (obj.upgrade && typeof obj.upgrade === 'object') blankMoneyFields(obj.upgrade);
        return obj;
    }

    function stripPricingFromRoom(room) {
        var clone = deepClone(room) || {};
        if (Object.prototype.hasOwnProperty.call(clone, 'markup')) clone.markup = 0;
        asArray(clone.items).forEach(blankMoneyFields);
        return clone;
    }

    function normalizeTemplate(template, includePricing) {
        var clone = deepClone(template) || {};
        var rooms = asArray(clone.rooms);
        if (!rooms.length && clone.room) rooms = [clone.room];
        return {
            name: clone.name || 'QuoteDr Template',
            rooms: includePricing ? deepClone(rooms) : rooms.map(stripPricingFromRoom),
            exportedAt: new Date().toISOString()
        };
    }

    function createExportPayload(templates, includePricing, options) {
        options = options || {};
        var list = asArray(templates).map(function(template) {
            var normalized = normalizeTemplate(template, includePricing);
            normalized.exportedAt = options.now || normalized.exportedAt;
            return normalized;
        });
        return {
            app: 'QuoteDr',
            type: TEMPLATE_FILE_TYPE,
            version: TEMPLATE_FILE_VERSION,
            includePricing: !!includePricing,
            exportedAt: options.now || new Date().toISOString(),
            templates: list
        };
    }

    function parseImportPayload(raw) {
        var payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!payload || typeof payload !== 'object') throw new Error('Template file is empty or invalid.');

        if (payload.type === TEMPLATE_FILE_TYPE && Array.isArray(payload.templates)) return payload;

        if (payload.rooms || payload.room) {
            return createExportPayload([payload], true);
        }

        if (Array.isArray(payload)) {
            return createExportPayload(payload, true);
        }

        throw new Error('This does not look like a QuoteDr template file.');
    }

    function uniqueTemplateName(existingTemplates, desiredName) {
        var base = desiredName || 'Imported Template';
        var names = asArray(existingTemplates).map(function(t) { return String(t.name || '').toLowerCase(); });
        if (names.indexOf(base.toLowerCase()) === -1) return base;
        var suffix = ' (Imported)';
        var candidate = base + suffix;
        var index = 2;
        while (names.indexOf(candidate.toLowerCase()) !== -1) {
            candidate = base + ' (Imported ' + index + ')';
            index++;
        }
        return candidate;
    }

    function prepareTemplatesForImport(payloadOrRaw, existingTemplates, options) {
        options = options || {};
        var payload = parseImportPayload(payloadOrRaw);
        var now = Number(options.now) || Date.now();
        var offset = 0;
        var existing = asArray(existingTemplates).slice();
        return asArray(payload.templates).map(function(template) {
            var imported = {
                id: now + offset++,
                name: uniqueTemplateName(existing, template.name || 'Imported Template'),
                rooms: asArray(template.rooms).map(function(room) {
                    var clonedRoom = deepClone(room) || {};
                    clonedRoom.id = now + offset++;
                    return clonedRoom;
                }),
                createdAt: new Date().toISOString(),
                importedAt: new Date().toISOString(),
                source: 'import'
            };
            existing.push(imported);
            return imported;
        });
    }

    global.QuoteDrTemplateFiles = {
        TEMPLATE_FILE_VERSION: TEMPLATE_FILE_VERSION,
        TEMPLATE_FILE_TYPE: TEMPLATE_FILE_TYPE,
        createExportPayload: createExportPayload,
        parseImportPayload: parseImportPayload,
        prepareTemplatesForImport: prepareTemplatesForImport,
        stripPricingFromRoom: stripPricingFromRoom
    };
})(typeof window !== 'undefined' ? window : globalThis);
