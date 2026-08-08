(function(root) {
    'use strict';

    if (!root) return;

    function engine() {
        if (!root.QuoteDrQuickBooksImport) throw new Error('QuickBooks import safety module is unavailable. Reload QuoteDr and try again.');
        return root.QuoteDrQuickBooksImport;
    }

    function normalizedType(type) {
        return type === 'clients' || type === 'customers' ? 'clients' : 'items';
    }

    function dataStorageKey(type) {
        return normalizedType(type) === 'clients' ? 'ald_clients' : 'ald_custom_items';
    }

    function readData(type) {
        var fallback = {};
        try {
            var parsed = JSON.parse(root.localStorage.getItem(dataStorageKey(type)) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function writeData(type, data) {
        root.localStorage.setItem(dataStorageKey(type), JSON.stringify(data || {}));
    }

    function errorMessage(error, fallback) {
        if (!error) return fallback || 'Cloud save failed.';
        if (typeof error === 'string') return error;
        return error.message || error.details || fallback || 'Cloud save failed.';
    }

    async function assertCloudResult(result, entityType, entityId, fallback) {
        if (result && result.error) {
            if (root.QuoteDrSave && typeof root.QuoteDrSave.discardPending === 'function') {
                await root.QuoteDrSave.discardPending(entityType, entityId, { state: 'quickbooks_import_aborted' }).catch(function() {});
            }
            throw new Error(errorMessage(result.error, fallback));
        }
        if (result && result.state && result.state !== 'cloud_saved') {
            var acknowledged = root.QuoteDrSave && typeof root.QuoteDrSave.requireCloudAck === 'function'
                ? await root.QuoteDrSave.requireCloudAck(entityType, entityId)
                : false;
            if (!acknowledged) {
                if (root.QuoteDrSave && typeof root.QuoteDrSave.discardPending === 'function') {
                    await root.QuoteDrSave.discardPending(entityType, entityId, { state: 'quickbooks_import_aborted' }).catch(function() {});
                }
                throw new Error(fallback || 'QuoteDr could not confirm the cloud save.');
            }
        }
        return result;
    }

    async function savePrimaryData(type, data) {
        type = normalizedType(type);
        if (type === 'clients') {
            if (typeof root.saveAllClientsToSupabase !== 'function') throw new Error('Client cloud sync is unavailable. Nothing was imported.');
            return assertCloudResult(
                await root.saveAllClientsToSupabase(Object.keys(data || {}).map(function(key) { return data[key]; })),
                'client_database',
                'account',
                'Client cloud save failed.'
            );
        }
        if (typeof root.backupItemsToCloud !== 'function') throw new Error('Item cloud backup is unavailable. Nothing was imported.');
        return assertCloudResult(await root.backupItemsToCloud(data || {}), 'item_database', 'account', 'Item cloud save failed.');
    }

    async function persistUndoSnapshot(type, snapshot) {
        var importer = engine();
        var cloudKey = importer.undoCloudKey(type);
        if (typeof root.saveUserDataValue !== 'function') {
            throw new Error('QuoteDr could not create a full cloud undo backup. Nothing was imported.');
        }
        var result = await root.saveUserDataValue(cloudKey, snapshot, {
            entityType: 'user_data',
            entityLabel: 'QuickBooks import undo backup'
        });
        await assertCloudResult(result, 'user_data', cloudKey, 'QuoteDr could not create a full cloud undo backup. Nothing was imported.');
        try { root.localStorage.setItem(importer.undoStorageKey(type), JSON.stringify(snapshot)); } catch (_) {}
        return snapshot;
    }

    async function loadUndoSnapshot(type) {
        type = normalizedType(type);
        var importer = engine();
        try {
            var local = JSON.parse(root.localStorage.getItem(importer.undoStorageKey(type)) || 'null');
            if (local && local.version === importer.VERSION) return local;
        } catch (_) {}

        if (typeof root.loadUserDataValue !== 'function') return null;
        var result = await root.loadUserDataValue(importer.undoCloudKey(type));
        if (!result || result.error || !result.data || result.data.version !== importer.VERSION) return null;
        try { root.localStorage.setItem(importer.undoStorageKey(type), JSON.stringify(result.data)); } catch (_) {}
        return result.data;
    }

    async function importRecords(type, records, options) {
        type = normalizedType(type);
        options = options || {};
        var importer = engine();
        var beforeData = readData(type);
        var applied = importer.applyImport(type, beforeData, records || [], {
            pricePolicy: options.pricePolicy,
            importedAt: options.importedAt || new Date().toISOString()
        });

        if (!applied.changed) {
            if (applied.summary.ambiguousSkipped) {
                throw new Error('Nothing was changed because the selected records have ambiguous matches. Rename or review those QuoteDr records first.');
            }
            return { data: applied.data, summary: applied.summary, changed: false, snapshot: null };
        }

        var snapshot = importer.createUndoSnapshot(type, beforeData, applied.data, {
            realmId: options.realmId || '',
            importedIds: (records || []).map(function(record) { return record && record.id; }),
            summary: applied.summary,
            createdAt: options.importedAt || new Date().toISOString()
        });

        await persistUndoSnapshot(type, snapshot);

        try {
            writeData(type, applied.data);
        } catch (error) {
            throw new Error('QuoteDr created the cloud backup but could not update this device: ' + errorMessage(error));
        }

        try {
            await savePrimaryData(type, applied.data);
        } catch (error) {
            try { writeData(type, beforeData); } catch (_) {}
            throw new Error(errorMessage(error, 'The import did not save. Your original data was restored on this device.'));
        }

        return { data: applied.data, summary: applied.summary, changed: true, snapshot: snapshot };
    }

    async function undoState(type) {
        type = normalizedType(type);
        var snapshot = await loadUndoSnapshot(type);
        var current = readData(type);
        return {
            type: type,
            snapshot: snapshot,
            available: engine().canUndo(snapshot, current),
            current: current
        };
    }

    async function undoLastImport(type) {
        type = normalizedType(type);
        var state = await undoState(type);
        if (!state.snapshot) throw new Error('No QuickBooks import backup was found.');
        if (!state.available) {
            throw new Error('This import cannot be undone automatically because the ' + (type === 'clients' ? 'client list' : 'item library') + ' changed afterward. No data was changed.');
        }

        var afterData = state.current;
        var beforeData = state.snapshot.before_data;
        try {
            writeData(type, beforeData);
            await savePrimaryData(type, beforeData);
        } catch (error) {
            try { writeData(type, afterData); } catch (_) {}
            throw new Error(errorMessage(error, 'Undo failed. The imported data is still in place.'));
        }

        state.snapshot.undone_at = new Date().toISOString();
        try {
            await persistUndoSnapshot(type, state.snapshot);
        } catch (_) {
            try { root.localStorage.setItem(engine().undoStorageKey(type), JSON.stringify(state.snapshot)); } catch (_) {}
        }
        return { data: beforeData, snapshot: state.snapshot };
    }

    root.QuoteDrQuickBooksImportController = {
        readData: readData,
        importRecords: importRecords,
        loadUndoSnapshot: loadUndoSnapshot,
        undoState: undoState,
        undoLastImport: undoLastImport
    };
})(typeof window !== 'undefined' ? window : null);
