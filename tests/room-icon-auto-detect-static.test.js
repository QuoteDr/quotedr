const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');

assert(
  builder.includes('function detectRoomIconForName(roomName)'),
  'Quote builder should expose a room-name icon detector'
);

assert(
  builder.includes('function detectRoomIconCandidatesForName(roomName)'),
  'Quote builder should expose multiple room-name icon candidates for ambiguous names'
);

assert(
  builder.includes('function showRoomIconAutoDetectChoices(roomId, candidates)'),
  'Room icon picker should show selectable options when auto detect finds multiple matches'
);

assert(
  builder.includes('function autoDetectRoomIcon(roomId)'),
  'Room icon picker should support auto detecting one room icon'
);

assert(
  builder.includes('function autoDetectAllRoomIcons()'),
  'Room icon picker should support auto detecting all room icons'
);

assert(
  builder.includes('Auto Detect') && builder.includes('Auto Detect All'),
  'Room icon picker should show Auto Detect and Auto Detect All actions'
);

assert(
  builder.includes('This will change all room icons if the tool thinks theirs better fits.'),
  'Auto Detect All should warn before changing every room icon'
);

assert(
  builder.includes("pattern: /\\b(bathroom|bath|ensuite|washroom|powder|toilet)\\b/") &&
  builder.includes("icon: 'fa-bath'"),
  'Detector should map bathroom-like room names to the bath icon'
);

assert(
  builder.includes("pattern: /\\b(kitchen|pantry|galley)\\b/") &&
  builder.includes("icon: 'fa-utensils'"),
  'Detector should map kitchen-like room names to the kitchen icon'
);

assert(
  builder.includes("pattern: /\\b(garage|carport)\\b/") &&
  builder.includes("icon: 'fa-car'"),
  'Detector should map garage-like room names to the car icon'
);

assert(
  builder.includes('2nd floor') &&
  builder.includes("icon: 'fa-building'"),
  'Detector should provide floor-level icon suggestions for names like 2nd floor'
);

assert(
  builder.includes("{ label: 'Landscape / Outdoor', icons: [") &&
    builder.includes("{ fa: 'fa-person-digging', label: 'Excavation / Shovel' }") &&
    builder.includes("{ fa: 'fa-mountain',        label: 'Gravel / Rocks' }") &&
    builder.includes("{ fa: 'fa-seedling',        label: 'Sod / Planting' }") &&
    builder.includes("{ fa: 'fa-truck-pickup',    label: 'Pickup / Hauling' }"),
  'Room icon picker should include landscape and outdoor room icons'
);

assert(
  builder.includes("pattern: /\\b(site prep|site preparation|prep work|excavation|digging|trenching|grading|earthwork)\\b/") &&
    builder.includes("icon: 'fa-person-digging'"),
  'Detector should map site preparation and excavation names to the digging icon'
);

assert(
  builder.includes("pattern: /\\b(gravel|rock|rocks|stone|boulder|boulders|aggregate|crusher run|clear stone)\\b/") &&
    builder.includes("icon: 'fa-mountain'"),
  'Detector should map gravel and rock names to the rocks icon'
);

assert(
  builder.includes("pattern: /\\b(tree removal|tree|trees|shrub|shrubs|brush|planting|sod|seed|seeding|garden|landscape|landscaping)\\b/") &&
    builder.includes("icon: 'fa-tree'"),
  'Detector should map tree and landscaping names to outdoor plant icons'
);

assert(
  builder.includes('var candidates = detectRoomIconCandidatesForName(room.name);') &&
  builder.includes('showRoomIconAutoDetectChoices(roomId, candidates);'),
  'Single-room auto detect should show choices instead of silently selecting a fallback when several icons match'
);

assert(
  builder.includes('Detected icon options') &&
  builder.includes('Click the icon that fits this room best.'),
  'Auto detect choices should explain that the user can pick the best detected icon'
);

assert(
  builder.includes("String(r.id) === String(roomId)"),
  'Auto detect should find rooms even if room ids are stringified by the UI'
);

assert(
  builder.includes('renderRooms();') && builder.includes('markUnsaved();'),
  'Auto Detect All should re-render rooms and mark the quote unsaved after changes'
);
