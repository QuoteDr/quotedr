const fs = require('fs');
const assert = require('assert');

const builder = fs.readFileSync('quote-builder.html', 'utf8');
const storage = fs.readFileSync('quote-storage.js', 'utf8');

assert(
  builder.includes('function renderTermsCheckboxes(appliedTerms)'),
  'Terms renderer should accept the quote-applied terms so checkbox state and badge count render together'
);

assert(
  builder.includes('var appliedTermSet = Array.isArray(appliedTerms) ? new Set(appliedTerms) : null;') &&
  builder.includes("var isChecked = appliedTermSet ? appliedTermSet.has(t.text) : !!t.defaultOn;"),
  'Terms renderer should check saved quote terms by text and fall back to defaults only for new quotes'
);

assert(
  storage.includes('renderTermsCheckboxes(data.terms);') &&
  storage.includes('renderTermsCheckboxes(session.terms);') &&
  storage.includes('renderTermsCheckboxes(draft.terms);') &&
  storage.includes('renderTermsCheckboxes(qData.terms);'),
  'Every quote load/restore path should render terms with the saved applied terms'
);

assert(
  !storage.includes('cb.checked = data.terms.includes(cb.dataset.text);') &&
  !storage.includes('cb.checked = session.terms.includes(cb.dataset.text);') &&
  !storage.includes('cb.checked = draft.terms.includes(cb.dataset.text);') &&
  !storage.includes('cb.checked = qData.terms.includes(cb.dataset.text);'),
  'Load paths should not mutate term checkboxes after render because that leaves the badge stale'
);
