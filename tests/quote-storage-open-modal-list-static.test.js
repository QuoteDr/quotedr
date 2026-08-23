const fs = require('fs');
const assert = require('assert');

const storage = fs.readFileSync('quote-storage.js', 'utf8');

assert(
  storage.includes('function quoteStorageData(row)') &&
    storage.includes('function quoteStorageIsJunked(row)') &&
    storage.includes('function quoteStorageActiveRows(rows)'),
  'Open Quote modal should share dashboard-style active quote filtering helpers'
);

assert(
  storage.includes('function quoteStorageDisplayTitle(row)') &&
    storage.includes('data.quoteTitle') &&
    storage.includes("quoteStorageDisplayTitle(q)"),
  'Open Quote modal should display the user-created quote title before client fallback'
);

assert(
  storage.includes('quoteStorageActiveRows((result && result.data) ? result.data : [])'),
  'Open Quote modal should filter Supabase rows before rendering'
);

assert(
  storage.includes("!quoteStorageIsJunked(row)") &&
    storage.includes("quoteStorageDuplicateKey(row)") &&
    storage.includes("quoteStorageRowTime(row)") &&
    storage.includes("Object.prototype.hasOwnProperty.call(seen, key)"),
  'Open Quote modal should hide junked rows and collapse duplicate draft rows'
);

assert(
  storage.includes('quoteStorageEscapeHtml(displayTitle)') &&
    storage.includes('quoteStorageJsAttr(q.id)'),
  'Open Quote modal should escape rendered cloud quote content and ids'
);

assert(
  storage.includes('var portalLocked = quoteDataIsPortalLockedForBuilder(data);') &&
    storage.includes('title="Locked in client portal"') &&
    storage.includes('fa-lock me-1') &&
    storage.includes('In portal'),
  'Open Quote modal should mark portal-locked quotes before the user clicks them'
);
