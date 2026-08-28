const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scope = require(path.join(root, 'change-order-scope.js'));

test('buildDiff reports only client-included change order differences', () => {
    const rooms = [{
        name: 'Deck',
        _coOriginalRoomName: 'Rear Deck',
        items: [
            {
                description: 'Deck boards', quantity: 120, unitType: 'sq ft', rate: 8,
                _coOriginal: { description: 'Deck boards', quantity: 100, unitType: 'sq ft', rate: 8 }
            },
            {
                description: 'Railing', quantity: 20, unitType: 'LF', rate: 55,
                _coOriginal: { description: 'Railing', quantity: 20, unitType: 'LF', rate: 55 },
                _coRemoved: true
            },
            { description: 'Stair', quantity: 1, unitType: 'each', rate: 600 },
            {
                description: 'Selected railing finish', quantity: 1, unitType: 'each', rate: 100,
                optional: true, optionalSelectedByDefault: false,
                _coOriginal: { description: 'Selected railing finish', quantity: 1, unitType: 'each', rate: 100, optional: true, optionalSelectedByDefault: true }
            },
            { description: 'Unselected light', quantity: 1, unitType: 'each', rate: 200, optional: true, optionalSelectedByDefault: false }
        ]
    }];

    const diff = scope.buildDiff(rooms, {
        includeItem(item) { return !item.optional || item.optionalSelectedByDefault !== false; }
    });

    assert.deepEqual(diff.map(change => change.type), ['room_renamed', 'changed', 'removed', 'added', 'changed']);
    assert.equal(diff[1].fields[0].field, 'quantity');
    assert.equal(diff[1].fields[0].from, 100);
    assert.equal(diff[1].fields[0].to, 120);
    assert.equal(diff[4].fields[0].field, 'selections');
    assert.ok(!JSON.stringify(diff).includes('Unselected light'));
});

test('fingerprint is deterministic and changes with the quote delta', () => {
    const first = [{ type: 'added', room: 'Kitchen', item: { name: 'Pot light', quantity: 2 } }];
    const reorderedKeys = [{ room: 'Kitchen', item: { quantity: 2, name: 'Pot light' }, type: 'added' }];
    const changed = [{ type: 'added', room: 'Kitchen', item: { name: 'Pot light', quantity: 3 } }];
    assert.equal(scope.fingerprint(first), scope.fingerprint(reorderedKeys));
    assert.notEqual(scope.fingerprint(first), scope.fingerprint(changed));
});

test('prompt forbids invented reasons and pricing claims', () => {
    const prompt = scope.buildPrompt([{ type: 'added', room: 'Kitchen', item: { name: 'Pot light' } }]);
    assert.match(prompt, /Do not invent why the change was requested/);
    assert.match(prompt, /prices, totals/);
    assert.match(prompt, /Pot light/);
});

test('builder exposes automatic, manual AI Scope, and durable per-document state', () => {
    const builder = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
    const storage = fs.readFileSync(path.join(root, 'quote-storage.js'), 'utf8');
    assert.match(builder, /id="changeOrderScopeAutomatic"/);
    assert.match(builder, /id="changeOrderAiScopeBtn"/);
    assert.match(builder, /Default Automatic ON for new change orders/);
    assert.match(builder, /current && !window\._changeOrderScopeAiOwned/);
    assert.match(builder, /change_order_scope_preferences/);
    assert.match(storage, /changeOrderScopeAutomatic/);
    assert.match(storage, /changeOrderScopeAiOwned/);
    assert.match(storage, /changeOrderScopeFingerprint/);
});
