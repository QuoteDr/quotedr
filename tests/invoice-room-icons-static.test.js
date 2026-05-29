const fs = require('fs');
const assert = require('assert');

const invoice = fs.readFileSync('invoice-viewer.html', 'utf8');

assert(
  invoice.includes('function invoiceRoomIconClass(room)'),
  'Invoice viewer should normalize room.icon from quote builder data'
);

assert(
  invoice.includes("(room && room.icon) || 'fa-door-open'"),
  'Invoice room icon helper should use the saved room icon before falling back to the default'
);

assert(
  invoice.includes('invoiceRoomIconClass(room)'),
  'Invoice room header should render the saved room icon'
);

assert(
  !invoice.includes('<strong><i class="fas fa-door-open"></i> ${escapeHtml(room.name'),
  'Invoice room header should not hard-code the default door icon'
);
