(function(root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QuoteDrClientDecisions = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';

    function cleanId(value) {
        return String(value === undefined || value === null ? '' : value).trim().slice(0, 200);
    }

    function cleanIds(values) {
        var seen = {};
        return (Array.isArray(values) ? values : []).map(cleanId).filter(function(value) {
            if (!value || seen[value]) return false;
            seen[value] = true;
            return true;
        }).slice(0, 100);
    }

    function finiteQuantity(value) {
        var parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) return 0;
        return Math.min(parsed, 1000000);
    }

    function upgradeGroups(item) {
        return Array.isArray(item && item.upgradeGroups) ? item.upgradeGroups : [];
    }

    function collectUpgradeGroups(item) {
        return upgradeGroups(item).map(function(group, groupIndex) {
            var options = Array.isArray(group && group.options) ? group.options : [];
            var selectedOptionIds = cleanIds(group && group.selectedOptionIds);
            var selectedSet = {};
            selectedOptionIds.forEach(function(optionId) { selectedSet[optionId] = true; });
            var manualQuantities = options.filter(function(option) {
                var optionId = cleanId(option && option.id);
                return selectedSet[optionId] && String(option && option.quantityMode || '').toLowerCase() === 'manual';
            }).map(function(option, optionIndex) {
                return {
                    optionId: cleanId(option && option.id) || ('viewer_upo_' + groupIndex + '_' + optionIndex),
                    quantity: finiteQuantity(option && option.manualQuantity)
                };
            });
            return {
                groupId: cleanId(group && group.id) || ('viewer_upg_' + groupIndex),
                selectedOptionIds: selectedOptionIds,
                manualQuantities: manualQuantities
            };
        });
    }

    function collectChoice(item) {
        var group = item && item.choiceGroup;
        if (!group || typeof group !== 'object') return null;
        return {
            groupId: cleanId(group.id),
            selectedOptionIds: cleanIds(group.selectedOptionIds),
            enhancementGroups: (Array.isArray(group.enhancementGroups) ? group.enhancementGroups : []).map(function(enhancement, groupIndex) {
                return {
                    groupId: cleanId(enhancement && enhancement.id) || ('viewer_enh_' + groupIndex),
                    selectedOptionIds: cleanIds(enhancement && enhancement.selectedOptionIds)
                };
            })
        };
    }

    function collectItems(rooms) {
        var decisions = [];
        (Array.isArray(rooms) ? rooms : []).forEach(function(room, roomIndex) {
            (Array.isArray(room && room.items) ? room.items : []).forEach(function(item, itemIndex) {
                item = item || {};
                var decision = {
                    roomIndex: roomIndex,
                    itemIndex: itemIndex
                };
                var roomId = cleanId(room && room.id);
                var itemId = cleanId(item.id);
                if (roomId) decision.roomId = roomId;
                if (itemId) decision.itemId = itemId;

                var hasDecision = false;
                if (item.optional === true) {
                    decision.optionalSelected = item._removed !== true && item._optionalSelected !== false;
                    hasDecision = true;
                }
                if (item.upgrade && typeof item.upgrade === 'object') {
                    decision.legacyUpgradeSelected = item.upgraded === true;
                    hasDecision = true;
                }
                var choice = collectChoice(item);
                if (choice) {
                    decision.choice = choice;
                    hasDecision = true;
                }
                var groups = collectUpgradeGroups(item);
                if (groups.length) {
                    decision.upgradeGroups = groups;
                    hasDecision = true;
                }
                if (hasDecision) decisions.push(decision);
            });
        });
        return decisions;
    }

    function collectRoomNotes(notes) {
        var output = {};
        if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return output;
        Object.keys(notes).slice(0, 200).forEach(function(key) {
            if (!/^\d+$/.test(String(key))) return;
            var value = String(notes[key] || '').trim();
            if (value) output[String(Number(key))] = value.slice(0, 4000);
        });
        return output;
    }

    function collect(rooms, roomNotes) {
        return {
            items: collectItems(rooms),
            roomNotes: collectRoomNotes(roomNotes)
        };
    }

    return {
        collect: collect,
        collectItems: collectItems,
        collectRoomNotes: collectRoomNotes
    };
});
