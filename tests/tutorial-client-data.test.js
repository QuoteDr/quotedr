const assert = require('assert');
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'demo-data', 'quotedr-tutorial-clients.csv');
const source = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) {
            if (char === '"' && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n') {
            row.push(field.replace(/\r$/, ''));
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }
    if (field || row.length) {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
    }
    return rows;
}

const rows = parseCsv(source);
assert.deepStrictEqual(rows[0], ['Name', 'Phone', 'Email', 'Address', 'City', 'Notes']);
assert.strictEqual(rows.length - 1, 30, 'tutorial list should contain 30 clients');

const clients = rows.slice(1);
clients.forEach((client, index) => {
    assert.strictEqual(client.length, 6, `client row ${index + 1} should have six columns`);
    assert(client[0] && client[3] && client[4] && client[5], `client row ${index + 1} should be complete`);
    assert(/^\d{3}-555-01\d{2}$/.test(client[1]), `${client[0]} should use the reserved 555-01xx range`);
    assert(/^[a-z0-9.]+@example\.com$/i.test(client[2]), `${client[0]} should use example.com`);
});

for (const column of [0, 1, 2]) {
    assert.strictEqual(new Set(clients.map(client => client[column].toLowerCase())).size, clients.length, `column ${column} should be unique`);
}

assert(!source.includes('@gmail.com'), 'tutorial data must not contain personal Gmail addresses');
assert(!source.toLowerCase().includes('alddirect'), 'tutorial data must not contain the contractor business identity');

console.log('tutorial client data test passed');
