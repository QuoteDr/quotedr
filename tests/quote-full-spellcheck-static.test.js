const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'quote-builder.html'), 'utf8');
const supabase = fs.readFileSync(path.join(root, 'supabase-v2.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'ai-assistant', 'index.ts'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'supabase', 'functions', '_shared', 'ai-usage-policy.mjs'), 'utf8');

assert(html.includes('Check Entire Quote'), 'Tools menu should expose the full quote spell checker');
assert(html.includes('function openFullQuoteSpellcheck()'), 'quote builder should pass live quote state into the spell checker');
assert(html.includes('function applyFullQuoteSpellcheckState(state)'), 'approved corrections should flow back into the quote builder');
assert(html.includes('quote-spellcheck.js'), 'quote builder should load the full quote spellcheck module');
const spellcheckModule = fs.readFileSync(path.join(root, 'quote-spellcheck.js'), 'utf8');
assert(
  spellcheckModule.includes('qd-spell-edit') &&
    spellcheckModule.includes('Correct wording') &&
    spellcheckModule.includes('Use My Wording') &&
    spellcheckModule.includes('function applyManualSuggestion(index)'),
  'each suggested correction should allow the user to type and apply different wording'
);
assert(supabase.includes("'writing_suggestions'"), 'AI quote spell check should be registered as a Pro feature');
assert(edge.includes("feature === 'writing_suggestions'"), 'AI assistant should use the proofreader system prompt for quote scans');
assert(policy.includes('maxInputChars: 12000'), 'AI policy should permit safely chunked full quote scans');

console.log('full quote spellcheck static checks passed');
