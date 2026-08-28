(function(root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.QuoteDrChangeOrderScope = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';

    function text(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function number(value) {
        var parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function sameNumber(a, b) {
        return Math.abs(number(a) - number(b)) < 0.0001;
    }

    function itemName(item) {
        return text(item && (item.description || item.serviceName)) || 'Line item';
    }

    function itemUnit(item) {
        return text(item && (item.unitType || item.unit));
    }

    function selectedGroupNames(groups) {
        var names = [];
        (groups || []).forEach(function(group) {
            var selected = Array.isArray(group && group.selectedOptionIds) ? group.selectedOptionIds : [];
            (group && group.options || []).forEach(function(option) {
                if (option && selected.indexOf(option.id) !== -1) names.push(text(option.name || option.label || option.id));
            });
        });
        return names.filter(Boolean).sort();
    }

    function selectionSnapshot(item) {
        var selections = [];
        if (item && item.upgraded && item.upgrade) selections.push(text(item.upgrade.name || item.upgrade.description || 'Upgrade'));
        selections = selections.concat(selectedGroupNames(item && item.upgradeGroups));
        if (item && item.choiceGroup) {
            var selectedBaseIds = Array.isArray(item.choiceGroup.selectedOptionIds) ? item.choiceGroup.selectedOptionIds : [];
            (item.choiceGroup.options || []).forEach(function(option) {
                if (option && selectedBaseIds.indexOf(option.id) !== -1) selections.push(text(option.name || option.label || option.id));
            });
            selections = selections.concat(selectedGroupNames(item.choiceGroup.enhancementGroups));
        }
        return {
            optionalIncluded: !(item && item.optional) || item.optionalSelectedByDefault !== false,
            selected: selections.filter(Boolean).sort()
        };
    }

    function itemSnapshot(item) {
        return {
            name: itemName(item),
            category: text(item && item.category),
            quantity: number(item && item.quantity),
            unit: itemUnit(item),
            rate: number(item && item.rate),
            description: text(item && (item.itemDescription || item.notes)),
            selections: selectionSnapshot(item)
        };
    }

    function changedFields(original, current) {
        var changes = [];
        if (!sameNumber(original.quantity, current.quantity)) changes.push({ field: 'quantity', from: original.quantity, to: current.quantity, unit: current.unit || original.unit });
        if (!sameNumber(original.rate, current.rate)) changes.push({ field: 'rate', from: original.rate, to: current.rate });
        if (original.name !== current.name) changes.push({ field: 'name', from: original.name, to: current.name });
        if (original.category !== current.category) changes.push({ field: 'category', from: original.category, to: current.category });
        if (original.unit !== current.unit) changes.push({ field: 'unit', from: original.unit, to: current.unit });
        if (original.description !== current.description) changes.push({ field: 'description', from: original.description, to: current.description });
        if (stableJson(original.selections) !== stableJson(current.selections)) changes.push({ field: 'selections', from: original.selections, to: current.selections });
        return changes;
    }

    function buildDiff(rooms, options) {
        options = options || {};
        var includeItem = typeof options.includeItem === 'function' ? options.includeItem : function() { return true; };
        var changes = [];
        (rooms || []).forEach(function(room) {
            var roomName = text(room && room.name) || 'Unassigned area';
            var originalRoomName = text(room && room._coOriginalRoomName);
            if (originalRoomName && originalRoomName !== roomName) {
                changes.push({ type: 'room_renamed', room: roomName, from: originalRoomName, to: roomName });
            }
            (room && room.items || []).forEach(function(item) {
                if (!item || item._excludeFromQuote) return;
                var current = itemSnapshot(item);
                var original = item._coOriginal ? itemSnapshot(item._coOriginal) : null;
                if (!original) {
                    if (!includeItem(item, room)) return;
                    changes.push({ type: 'added', room: roomName, item: current });
                    return;
                }
                if (item._coRemoved) {
                    changes.push({ type: 'removed', room: roomName, item: original });
                    return;
                }
                var fields = changedFields(original, current);
                if (fields.length) changes.push({ type: 'changed', room: roomName, item: current, original: original, fields: fields });
            });
        });
        return changes;
    }

    function stableJson(value) {
        if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
        if (value && typeof value === 'object') {
            return '{' + Object.keys(value).sort().map(function(key) {
                return JSON.stringify(key) + ':' + stableJson(value[key]);
            }).join(',') + '}';
        }
        return JSON.stringify(value);
    }

    function fingerprint(changes) {
        var input = stableJson(changes || []);
        var hash = 2166136261;
        for (var index = 0; index < input.length; index++) {
            hash ^= input.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return 'co-' + (hash >>> 0).toString(16);
    }

    function buildPrompt(changes) {
        return [
            'Write a concise, client-facing reason and scope for a construction change order.',
            'Use only the supplied original-versus-change-order differences.',
            'Clearly describe additions, removals, credits, quantity changes, and changed specifications.',
            'Do not invent why the change was requested, site conditions, approvals, timing, prices, totals, or work that is not in the data.',
            'If no reason is supplied, describe what changed without claiming a reason.',
            'Return plain text only, in one short paragraph followed by brief bullets when useful. Do not add a heading.',
            '',
            'Change data JSON:',
            JSON.stringify(changes || [])
        ].join('\n').slice(0, 12000);
    }

    function normalizeReply(reply) {
        return String(reply || '')
            .replace(/^\s*["']|["']\s*$/g, '')
            .replace(/^#+\s*/gm, '')
            .replace(/^\s*(change order scope|scope of change|reason \/ scope change)\s*:?\s*$/gim, '')
            .trim();
    }

    return {
        buildDiff: buildDiff,
        fingerprint: fingerprint,
        buildPrompt: buildPrompt,
        normalizeReply: normalizeReply
    };
});
