const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const settings = fs.readFileSync(path.resolve(__dirname, '..', 'settings.html'), 'utf8');
const start = settings.indexOf('\t\tfunction teamRoleEditorMessage(');
const end = settings.indexOf('\t\tfunction teamRoleCategoryLabel(', start);
if (start < 0 || end < 0) throw new Error('Could not locate the team role error behavior');
const behaviorSource = settings.slice(start, end);

function modalContext() {
  const message = { textContent: '', className: '' };
  const name = {
    attributes: {},
    focused: false,
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() { this.focused = true; }
  };
  const modalBody = {
    calls: [],
    scrollTo(options) { this.calls.push(options); }
  };
  const document = {
    getElementById(id) {
      if (id === 'teamRoleEditorMessage') return message;
      if (id === 'teamRoleName') return name;
      return null;
    },
    querySelector(selector) {
      return selector === '#teamRoleModal .modal-body' ? modalBody : null;
    }
  };
  const context = vm.createContext({ document, String, Array });
  vm.runInContext(behaviorSource, context, { filename: 'settings-team-role-error.js' });
  return { context, message, name, modalBody };
}

test('mobile role-name collision scrolls the error into view and focuses the name', () => {
  const fixture = modalContext();
  fixture.context.showTeamRoleSaveError({
    code: 'role_name_taken',
    message: 'A role with this name already exists. Choose a different name or edit the existing role.'
  });
  assert.match(fixture.message.textContent, /Choose a different name/);
  assert.match(fixture.message.className, /\balert-danger\b/);
  assert.equal(fixture.modalBody.calls.length, 1);
  assert.equal(fixture.modalBody.calls[0].top, 0);
  assert.equal(fixture.modalBody.calls[0].behavior, 'smooth');
  assert.equal(fixture.name.attributes['aria-invalid'], 'true');
  assert.equal(fixture.name.focused, true);
});

test('unexpected role save errors reassure the user that no changes were applied', () => {
  const fixture = modalContext();
  fixture.context.showTeamRoleSaveError({ code: 'request_failed', message: 'Internal detail', supportId: 'ab12-cd34' });
  assert.equal(
    fixture.message.textContent,
    'The role could not be saved. No changes were applied. Try again. Reference AB12-CD34.'
  );
  assert.equal(fixture.name.focused, false);
  assert.equal(fixture.modalBody.calls.length, 1);
});
