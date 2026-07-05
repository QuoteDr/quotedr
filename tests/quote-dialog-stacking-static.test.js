const fs = require('fs');
const assert = require('assert');

const dialogs = fs.readFileSync('quote-dialogs.js', 'utf8');

assert(
  dialogs.includes("document.querySelector('.modal.show:not(#qdDialogModal)')"),
  'Dialog cleanup should preserve other open app modals'
);

assert(
  dialogs.includes("document.querySelectorAll('.modal-backdrop').forEach(function(backdrop) { backdrop.remove(); })"),
  'Dialog should remove stale Bootstrap backdrops before showing when safe'
);

assert(
  /function cleanup\(value, hideFirst\)/.test(dialogs) &&
  dialogs.includes("el.addEventListener('hidden.bs.modal', finish, { once: true });") &&
  dialogs.includes('cleanup(value, true)'),
  'Dialog button actions should resolve only after the modal is fully hidden'
);

assert(
  dialogs.includes("el.style.zIndex = '1105'") &&
  dialogs.includes("latestBackdrop.style.zIndex = '1100'") &&
  dialogs.includes("data-qd-dialog-backdrop"),
  'Dialog prompts opened from nested modals should stack above the current modal'
);
