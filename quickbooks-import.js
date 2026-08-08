(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QuoteDrQuickBooksImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    var VERSION = 1;
    var CLIENTS_TYPE = 'clients';
    var ITEMS_TYPE = 'items';

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function deepClone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function normalizeName(value) {
        var text = String(value == null ? '' : value);
        if (typeof text.normalize === 'function') text = text.normalize('NFKC');
        return text
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u2010-\u2015]/g, '-')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    }

    function normalizeId(value) {
        return String(value == null ? '' : value).trim();
    }

    function externalId(entity) {
        if (!entity) return '';
        return normalizeId(
            entity.qb_id ||
            entity.quickbooks_id ||
            (entity.quickbooks && entity.quickbooks.id) ||
            (entity.crm && entity.crm.quickbooks && entity.crm.quickbooks.id)
        );
    }

    function incomingId(record) {
        return normalizeId(record && (record.id || record.qb_id || record.quickbooks_id));
    }

    function isQuickBooksImported(ref) {
        var entity = ref && ref.entity || {};
        var source = normalizeName(entity.source || entity.source_label);
        return source.indexOf('quickbooks') !== -1 || normalizeName(ref && ref.category) === 'quickbooks';
    }

    function clientStore(value) {
        var store = {};
        if (Array.isArray(value)) {
            value.forEach(function(client, index) {
                if (!client || !client.name) return;
                var key = String(client.name);
                while (Object.prototype.hasOwnProperty.call(store, key)) key = String(client.name) + ' #' + (index + 1);
                store[key] = deepClone(client);
            });
            return store;
        }
        Object.keys(isPlainObject(value) ? value : {}).forEach(function(key) {
            store[key] = deepClone(value[key]);
        });
        return store;
    }

    function itemStore(value) {
        var data = deepClone(isPlainObject(value) ? value : {});
        return isPlainObject(data) ? data : {};
    }

    function clientRefs(value) {
        var refs = [];
        Object.keys(isPlainObject(value) ? value : {}).forEach(function(key) {
            var entity = value[key];
            if (entity && typeof entity === 'object') refs.push({ key: key, entity: entity });
        });
        return refs;
    }

    function itemRefs(value) {
        var refs = [];
        Object.keys(isPlainObject(value) ? value : {}).forEach(function(category) {
            var group = value[category];
            if (!Array.isArray(group)) return;
            group.forEach(function(entity, index) {
                if (entity && typeof entity === 'object') refs.push({ category: category, index: index, entity: entity });
            });
        });
        return refs;
    }

    function uniqueRefs(refs) {
        var seen = [];
        return refs.filter(function(ref) {
            if (seen.indexOf(ref.entity) !== -1) return false;
            seen.push(ref.entity);
            return true;
        });
    }

    function resolveMatches(type, existingData, record) {
        var refs = type === CLIENTS_TYPE ? clientRefs(existingData) : itemRefs(existingData);
        var id = incomingId(record);
        var name = normalizeName(record && record.name);
        var strong = id ? refs.filter(function(ref) { return externalId(ref.entity) === id; }) : [];
        var named = name ? refs.filter(function(ref) { return normalizeName(ref.entity && ref.entity.name) === name; }) : [];
        var ambiguous = false;
        var ambiguityReason = '';
        var matches = [];

        if (strong.length) {
            var strongEntities = strong.map(function(ref) { return ref.entity; });
            var extraNamed = named.filter(function(ref) { return strongEntities.indexOf(ref.entity) === -1; });
            var conflictingLinked = extraNamed.filter(function(ref) {
                var linkedId = externalId(ref.entity);
                return linkedId && linkedId !== id;
            });
            var unlinkedOriginals = extraNamed.filter(function(ref) {
                return !externalId(ref.entity) && !isQuickBooksImported(ref);
            });
            var uncertainImported = extraNamed.filter(function(ref) {
                return !externalId(ref.entity) && isQuickBooksImported(ref);
            });

            if (conflictingLinked.length || unlinkedOriginals.length > 1 || uncertainImported.length) {
                ambiguous = true;
                ambiguityReason = conflictingLinked.length
                    ? 'This name is already linked to a different QuickBooks ID.'
                    : 'More than one QuoteDr record has this name.';
            } else {
                matches = strong.concat(unlinkedOriginals);
            }
        } else if (named.length === 1) {
            var namedId = externalId(named[0].entity);
            if (namedId && id && namedId !== id) {
                ambiguous = true;
                ambiguityReason = 'This name is already linked to a different QuickBooks ID.';
            } else {
                matches = named;
            }
        } else if (named.length > 1) {
            ambiguous = true;
            ambiguityReason = 'More than one QuoteDr record has this name.';
        }

        matches = uniqueRefs(matches);
        return {
            id: id,
            normalizedName: name,
            strongMatches: uniqueRefs(strong),
            nameMatches: uniqueRefs(named),
            matches: matches,
            ambiguous: ambiguous,
            ambiguityReason: ambiguityReason
        };
    }

    function valueRichness(value) {
        if (value == null || value === '') return 0;
        if (Array.isArray(value)) return value.length ? 2 + value.length : 0;
        if (isPlainObject(value)) {
            return Object.keys(value).reduce(function(total, key) { return total + valueRichness(value[key]); }, 0);
        }
        return 1;
    }

    function refScore(ref) {
        var score = isQuickBooksImported(ref) ? 0 : 10000;
        if (ref.category && normalizeName(ref.category) !== 'quickbooks') score += 2000;
        score += valueRichness(ref.entity);
        return score;
    }

    function chooseSurvivor(matches) {
        return matches.slice().sort(function(a, b) { return refScore(b) - refScore(a); })[0] || null;
    }

    function canonicalValue(value) {
        if (Array.isArray(value)) return value.map(canonicalValue);
        if (!isPlainObject(value)) return value;
        var output = {};
        Object.keys(value).sort().forEach(function(key) {
            if (value[key] !== undefined) output[key] = canonicalValue(value[key]);
        });
        return output;
    }

    function stableStringify(value) {
        return JSON.stringify(canonicalValue(value));
    }

    function mergeArrays(target, source) {
        var result = Array.isArray(target) ? deepClone(target) : [];
        var seen = {};
        result.forEach(function(value) { seen[stableStringify(value)] = true; });
        (Array.isArray(source) ? source : []).forEach(function(value) {
            var key = stableStringify(value);
            if (seen[key]) return;
            seen[key] = true;
            result.push(deepClone(value));
        });
        return result;
    }

    function isMissing(value) {
        return value === undefined || value === null || value === '';
    }

    function mergePreserving(target, source, skipKeys) {
        var output = isPlainObject(target) ? deepClone(target) : {};
        var skipped = skipKeys || {};
        Object.keys(isPlainObject(source) ? source : {}).forEach(function(key) {
            if (skipped[key]) return;
            var incoming = source[key];
            var current = output[key];
            if (Array.isArray(incoming)) {
                output[key] = mergeArrays(Array.isArray(current) ? current : [], incoming);
            } else if (isPlainObject(incoming)) {
                output[key] = mergePreserving(isPlainObject(current) ? current : {}, incoming, {});
            } else if (isMissing(current) && !isMissing(incoming)) {
                output[key] = incoming;
            }
        });
        return output;
    }

    function numericValue(value) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object || {}, key);
    }

    function distinctNumbers(values) {
        var result = [];
        values.forEach(function(value) {
            var number = numericValue(value);
            if (!result.some(function(existing) { return Math.abs(existing - number) < 0.000001; })) result.push(number);
        });
        return result;
    }

    function analyzeRecord(type, existingData, record) {
        var resolved = resolveMatches(type, existingData, record || {});
        var survivor = chooseSurvivor(resolved.matches);
        var analysis = {
            status: resolved.ambiguous ? 'ambiguous' : (resolved.matches.length > 1 ? 'duplicate' : (resolved.matches.length === 1 ? 'existing' : 'new')),
            matchCount: resolved.matches.length,
            duplicateCount: Math.max(0, resolved.matches.length - 1),
            ambiguous: resolved.ambiguous,
            ambiguityReason: resolved.ambiguityReason,
            matchedCategory: survivor && survivor.category || '',
            matchedName: survivor && survivor.entity && survivor.entity.name || '',
            quickBooksRate: numericValue(record && record.rate),
            quoteDrRates: [],
            priceConflict: false
        };

        if (type === ITEMS_TYPE && resolved.matches.length) {
            analysis.quoteDrRates = distinctNumbers(resolved.matches
                .filter(function(ref) { return hasOwn(ref.entity, 'rate'); })
                .map(function(ref) { return ref.entity.rate; }));
            analysis.priceConflict = analysis.quoteDrRates.some(function(rate) {
                return Math.abs(rate - analysis.quickBooksRate) >= 0.000001;
            });
        }
        return analysis;
    }

    function analyzeRecords(type, existingData, records) {
        return (records || []).map(function(record) { return analyzeRecord(type, existingData, record); });
    }

    function mappedClient(record, importedAt) {
        var id = incomingId(record);
        return {
            name: String(record && record.name || '').trim(),
            phone: record && record.phone || '',
            email: record && record.email || '',
            address: record && record.address || '',
            city: record && record.city || '',
            qb_id: id,
            quickbooks_id: id,
            source: 'quickbooks',
            source_label: 'Imported from QuickBooks',
            crm: {
                quickbooks: {
                    id: id,
                    lastImportedAt: importedAt
                }
            }
        };
    }

    function mappedItem(record, importedAt) {
        var id = incomingId(record);
        var description = record && record.description || '';
        return {
            name: String(record && record.name || '').trim(),
            itemDescription: description,
            description: description,
            unitType: record && record.unitType || 'service',
            rate: numericValue(record && record.rate),
            materialCost: numericValue(record && record.materialCost),
            qb_id: id,
            quickbooks_id: id,
            source: 'quickbooks',
            source_label: 'Imported from QuickBooks',
            quickbooks: {
                id: id,
                lastImportedAt: importedAt
            }
        };
    }

    function mergeClientCandidates(matches, survivor) {
        var skipped = { name: true, qb_id: true, quickbooks_id: true, source: true, source_label: true };
        var merged = deepClone(survivor.entity);
        matches.forEach(function(ref) {
            if (ref === survivor) return;
            var candidate = deepClone(ref.entity);
            if (/^Imported from QuickBooks customer ID\b/i.test(String(candidate.notes || ''))) delete candidate.notes;
            merged = mergePreserving(merged, candidate, skipped);
        });
        return merged;
    }

    function applyClientImport(existingData, records, options) {
        var data = clientStore(existingData);
        var importedAt = options.importedAt;
        var summary = { selected: records.length, added: 0, linked: 0, duplicateGroups: 0, duplicatesRemoved: 0, ambiguousSkipped: 0, priceConflicts: 0 };

        records.forEach(function(record) {
            var resolved = resolveMatches(CLIENTS_TYPE, data, record);
            if (resolved.ambiguous) {
                summary.ambiguousSkipped++;
                return;
            }
            var mapped = mappedClient(record, importedAt);
            if (!resolved.matches.length) {
                data[mapped.name] = mapped;
                summary.added++;
                return;
            }

            var survivor = chooseSurvivor(resolved.matches);
            var merged = mergeClientCandidates(resolved.matches, survivor);
            merged = mergePreserving(merged, mapped, { name: true, qb_id: true, quickbooks_id: true, source: true, source_label: true });
            merged.name = String(merged.name || survivor.entity.name || mapped.name).trim();
            merged.qb_id = mapped.qb_id;
            merged.quickbooks_id = mapped.quickbooks_id;
            merged.crm = mergePreserving(merged.crm || {}, mapped.crm, {});
            merged.crm.quickbooks = Object.assign({}, merged.crm.quickbooks || {}, mapped.crm.quickbooks);
            if (isQuickBooksImported(survivor)) {
                merged.source = 'quickbooks';
                merged.source_label = 'Imported from QuickBooks';
            }

            resolved.matches.forEach(function(ref) { delete data[ref.key]; });
            data[merged.name] = merged;
            summary.linked++;
            if (resolved.matches.length > 1) {
                summary.duplicateGroups++;
                summary.duplicatesRemoved += resolved.matches.length - 1;
            }
        });

        return { data: data, summary: summary };
    }

    function mergeItemCandidates(matches, survivor) {
        var skipped = {
            name: true,
            rate: true,
            materialCost: true,
            qb_id: true,
            quickbooks_id: true,
            source: true,
            source_label: true,
            quickbooks: true
        };
        var merged = deepClone(survivor.entity);
        matches.forEach(function(ref) {
            if (ref === survivor) return;
            merged = mergePreserving(merged, ref.entity, skipped);
        });
        return merged;
    }

    function quickBooksCategory(data) {
        var existing = Object.keys(data).find(function(category) { return normalizeName(category) === 'quickbooks'; });
        return existing || 'QuickBooks';
    }

    function applyItemImport(existingData, records, options) {
        var data = itemStore(existingData);
        var importedAt = options.importedAt;
        var pricePolicy = options.pricePolicy === 'use_quickbooks' ? 'use_quickbooks' : 'keep_quotedr';
        var summary = { selected: records.length, added: 0, linked: 0, duplicateGroups: 0, duplicatesRemoved: 0, ambiguousSkipped: 0, priceConflicts: 0, pricePolicy: pricePolicy };

        records.forEach(function(record) {
            var analysis = analyzeRecord(ITEMS_TYPE, data, record);
            var resolved = resolveMatches(ITEMS_TYPE, data, record);
            if (resolved.ambiguous) {
                summary.ambiguousSkipped++;
                return;
            }
            if (analysis.priceConflict) summary.priceConflicts++;
            var mapped = mappedItem(record, importedAt);
            if (!resolved.matches.length) {
                var category = quickBooksCategory(data);
                if (!Array.isArray(data[category])) data[category] = [];
                data[category].push(mapped);
                summary.added++;
                return;
            }

            var survivor = chooseSurvivor(resolved.matches);
            var merged = mergeItemCandidates(resolved.matches, survivor);
            merged = mergePreserving(merged, mapped, {
                name: true,
                rate: true,
                materialCost: true,
                qb_id: true,
                quickbooks_id: true,
                source: true,
                source_label: true,
                quickbooks: true
            });
            merged.name = String(merged.name || survivor.entity.name || mapped.name).trim();
            if (pricePolicy === 'use_quickbooks' || !hasOwn(merged, 'rate')) merged.rate = mapped.rate;
            if (pricePolicy === 'use_quickbooks' || !hasOwn(merged, 'materialCost')) merged.materialCost = mapped.materialCost;
            merged.qb_id = mapped.qb_id;
            merged.quickbooks_id = mapped.quickbooks_id;
            merged.quickbooks = Object.assign({}, merged.quickbooks || {}, mapped.quickbooks);
            if (isQuickBooksImported(survivor)) {
                merged.source = 'quickbooks';
                merged.source_label = 'Imported from QuickBooks';
            }

            var survivorEntity = survivor.entity;
            var losers = resolved.matches.filter(function(ref) { return ref !== survivor; }).map(function(ref) { return ref.entity; });
            Object.keys(data).forEach(function(categoryName) {
                if (!Array.isArray(data[categoryName])) return;
                data[categoryName] = data[categoryName].filter(function(item) { return losers.indexOf(item) === -1; });
                var survivorIndex = data[categoryName].indexOf(survivorEntity);
                if (survivorIndex !== -1) data[categoryName][survivorIndex] = merged;
            });
            summary.linked++;
            if (resolved.matches.length > 1) {
                summary.duplicateGroups++;
                summary.duplicatesRemoved += resolved.matches.length - 1;
            }
        });

        return { data: data, summary: summary };
    }

    function applyImport(type, existingData, records, options) {
        options = options || {};
        options.importedAt = options.importedAt || new Date().toISOString();
        var before = type === CLIENTS_TYPE ? clientStore(existingData) : itemStore(existingData);
        var result = type === CLIENTS_TYPE
            ? applyClientImport(before, records || [], options)
            : applyItemImport(before, records || [], options);
        result.changed = stableStringify(before) !== stableStringify(result.data);
        return result;
    }

    function fingerprint(value) {
        var input = stableStringify(value);
        var hash = 2166136261;
        for (var i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8) + ':' + input.length;
    }

    function comparableClientData(value) {
        var store = clientStore(value);
        return Object.keys(store).map(function(key) {
            var client = store[key] || {};
            var crm = deepClone(isPlainObject(client.crm) ? client.crm : {});
            var properties = mergeArrays(
                Array.isArray(client.properties) ? client.properties : [],
                Array.isArray(crm.quoteDrProperties) ? crm.quoteDrProperties : []
            );
            delete crm.quoteDrProperties;
            var notes = crm.notes || client.notes || '';
            delete crm.notes;
            return {
                name: String(client.name || key || '').trim(),
                phone: client.phone || '',
                email: client.email || '',
                address: client.address || '',
                city: client.city || '',
                notes: notes,
                crm: crm,
                properties: properties,
                qb_id: externalId(client)
            };
        }).sort(function(a, b) {
            var aKey = normalizeName(a.name) + '|' + a.qb_id + '|' + normalizeName(a.email);
            var bKey = normalizeName(b.name) + '|' + b.qb_id + '|' + normalizeName(b.email);
            return aKey.localeCompare(bKey);
        });
    }

    function fingerprintForType(type, value) {
        return fingerprint(type === CLIENTS_TYPE ? comparableClientData(value) : value);
    }

    function undoStorageKey(type) {
        return 'ald_quickbooks_import_undo_' + (type === CLIENTS_TYPE ? CLIENTS_TYPE : ITEMS_TYPE) + '_v' + VERSION;
    }

    function undoCloudKey(type) {
        return 'quickbooks_import_undo_' + (type === CLIENTS_TYPE ? CLIENTS_TYPE : ITEMS_TYPE) + '_v' + VERSION;
    }

    function createUndoSnapshot(type, beforeData, afterData, details) {
        details = details || {};
        var createdAt = details.createdAt || new Date().toISOString();
        return {
            version: VERSION,
            id: details.id || ('qb-import-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)),
            type: type === CLIENTS_TYPE ? CLIENTS_TYPE : ITEMS_TYPE,
            created_at: createdAt,
            realm_id: details.realmId || '',
            imported_ids: (details.importedIds || []).map(normalizeId).filter(Boolean),
            summary: deepClone(details.summary || {}),
            before_data: deepClone(beforeData),
            after_fingerprint: fingerprintForType(type, afterData),
            undone_at: null
        };
    }

    function canUndo(snapshot, currentData) {
        if (!snapshot || snapshot.version !== VERSION || snapshot.undone_at || !snapshot.before_data) return false;
        return snapshot.after_fingerprint === fingerprintForType(snapshot.type, currentData);
    }

    return {
        VERSION: VERSION,
        normalizeName: normalizeName,
        analyzeRecord: analyzeRecord,
        analyzeRecords: analyzeRecords,
        applyImport: applyImport,
        fingerprint: fingerprint,
        fingerprintForType: fingerprintForType,
        stableStringify: stableStringify,
        undoStorageKey: undoStorageKey,
        undoCloudKey: undoCloudKey,
        createUndoSnapshot: createUndoSnapshot,
        canUndo: canUndo
    };
});
