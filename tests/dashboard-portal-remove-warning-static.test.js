const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('async function confirmRemoveDocumentFromPortal(') &&
    dashboard.includes('Are you sure you want to remove this document from the client portal?') &&
    dashboard.includes('If you add it back later, the portal will show the new date it was added.'),
  'Dashboard should define a clear warning before removing a document from the client portal'
);

assert(
  /async function removeQuoteFromPortal\(\) \{[\s\S]*?var confirmed = await confirmRemoveDocumentFromPortal\(target\);[\s\S]*?if \(!confirmed\) return;[\s\S]*?var data = clearPortalAssignmentForEdit\(target\.data \|\| \{\}\);/.test(dashboard),
  'Remove This Document From Portal should ask for confirmation before clearing portal assignment'
);

assert(
  dashboard.includes("okText: 'Remove From Portal'") &&
    dashboard.includes("okClass: 'btn-danger'") &&
    dashboard.includes("type: 'warning'"),
  'Portal removal confirmation should use destructive warning button styling'
);
