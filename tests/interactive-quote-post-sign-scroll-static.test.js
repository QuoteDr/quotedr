const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(
  source.includes('function scrollToPostApprovalActions()'),
  'Interactive quote viewer should centralize post-sign scrolling'
);

assert(
  /scrollToPostApprovalActions[\s\S]*approveSection[\s\S]*stripeDepositSection[\s\S]*scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/.test(source),
  'Post-sign scroll should target the signed approval/deposit area smoothly'
);

assert(
  /function handleMainAction\(\)[\s\S]*if \(quoteIsAccepted\(\)\) \{[\s\S]*applyQuoteCompletionState\(\);[\s\S]*scrollToPostApprovalActions\(\);[\s\S]*return;/.test(source),
  'Accept button should scroll already-signed quotes to the signed/deposit area'
);

assert(
  /document\.getElementById\('approveSection'\)\.innerHTML = '<div class="alert alert-success mb-0"><i class="fas fa-check-circle me-1"><\/i>This quote has been accepted and signed\.<\/div>';[\s\S]*scrollToPostApprovalActions\(\);/.test(source),
  'Successful signing should show the signed message and scroll the client down to it'
);
