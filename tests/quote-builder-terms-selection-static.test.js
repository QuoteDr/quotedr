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
  builder.includes('function getQuoteTermsForRender(data)') &&
  builder.includes('if (data.termsExplicit === true) return Array.isArray(data.terms) ? data.terms : undefined;') &&
  builder.includes('if (Array.isArray(data.terms) && data.terms.length > 0) return data.terms;'),
  'Builder should distinguish explicit saved term choices from legacy empty term arrays'
);

assert(
  storage.includes('termsExplicit: true'),
  'Quote saves should mark terms as an explicit user selection so an intentional empty selection is preserved'
);

assert(
  storage.includes('renderTermsCheckboxes(getQuoteTermsForRender(data));') &&
  (storage.match(/renderTermsCheckboxes\(getQuoteTermsForRender\(qData\)\);/g) || []).length >= 2,
  'The unified direct-load and last-opened restore paths should normalize saved terms before rendering checkboxes'
);

assert(
  !storage.includes('cb.checked = data.terms.includes(cb.dataset.text);') &&
  !storage.includes('cb.checked = session.terms.includes(cb.dataset.text);') &&
  !storage.includes('cb.checked = draft.terms.includes(cb.dataset.text);') &&
  !storage.includes('cb.checked = qData.terms.includes(cb.dataset.text);'),
  'Load paths should not mutate term checkboxes after render because that leaves the badge stale'
);
