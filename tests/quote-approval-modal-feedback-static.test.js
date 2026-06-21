const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(source.includes('id="signatureApprovalMessage"'), 'signature modal should include an in-modal feedback area');
assert(source.includes('id="signApproveBtn"'), 'signature modal should give the approve button a stable id for loading state');
assert(source.includes('function showSignatureApprovalMessage'), 'quote viewer should centralize signature modal feedback');
assert(source.includes("showSignatureApprovalMessage('Please agree to the terms and conditions.'"), 'terms validation should show inside the signature modal');
assert(!source.includes("if (!document.getElementById('termsCheck').checked) { qdAlert('Please agree to the terms and conditions.'); return; }"), 'terms validation should not rely on a global modal hidden behind the signature overlay');
assert(source.includes("showSignatureApprovalMessage('Could not approve this quote: ' +"), 'approval save failures should show inside the signature modal');
assert(source.includes('approveBtn.disabled = true') && source.includes('approveBtn.disabled = false'), 'approval button should have a loading/restore state');

console.log('quote approval modal feedback static test passed');
