const assert = require('node:assert');
const fs = require('node:fs');

const source = fs.readFileSync('interactive-quote-viewer.html', 'utf8');

assert(source.includes('id="signatureApprovalMessage"'), 'signature modal should include an in-modal feedback area');
assert(source.includes('id="signApproveBtn"'), 'signature modal should give the approve button a stable id for loading state');
assert(source.includes('function showSignatureApprovalMessage'), 'quote viewer should centralize signature modal feedback');
assert(source.includes("showSignatureApprovalMessage('Please enter your full name.'"), 'name validation should show inside the signature modal');
assert(source.includes('id="signerNameRequiredModal"'), 'name validation should show a blocking pop-up modal before returning to signing');
assert(source.includes('function showSignerNameRequiredModal'), 'quote viewer should centralize the missing-name pop-up behavior');
assert(source.includes('function emphasizeSignerName'), 'quote viewer should animate and focus the full name field after the pop-up closes');
assert(source.includes('signer-name-attention'), 'full name field should have a visible attention animation class');
assert(/showSignerNameRequiredModal\([^)]*\)\.then\(emphasizeSignerName\)/.test(source), 'name validation should show the pop-up, then animate the full name field');
assert(source.includes('id="typedSignaturePreview"'), 'quote approval should show a live typed-signature preview');
assert(source.includes('QuoteDrTypedSignature.matchClientName'), 'quote approval should verify the typed signer against the quote client');
assert(source.includes("signature_method: 'typed'"), 'quote approval should persist typed signature evidence');
assert(source.includes('terms_accepted_at'), 'quote approval should persist a terms acknowledgement timestamp');
assert(!source.includes('id="signatureCanvas"'), 'quote approval should no longer require a drawn-signature canvas');
assert(!source.includes('sigHasStrokes'), 'quote approval should not retain drawn-signature state');
assert(source.includes("showSignatureApprovalMessage('Please agree to the terms and conditions.'"), 'terms validation should show inside the signature modal');
assert(source.includes('id="termsApprovalRequiredModal"'), 'terms validation should show a blocking pop-up modal before returning to signing');
assert(source.includes('function showTermsApprovalRequiredModal'), 'quote viewer should centralize the missing-terms pop-up behavior');
assert(source.includes('function emphasizeTermsAgreement'), 'quote viewer should animate and focus the terms agreement after the pop-up closes');
assert(source.includes('terms-check-attention'), 'terms agreement should have a visible attention animation class');
assert(/showTermsApprovalRequiredModal\(\)[\s\S]*\.then\(emphasizeTermsAgreement\)/.test(source), 'terms validation should show the pop-up, then animate the terms checkbox row');
assert(source.includes('id="viewSigningTermsBtn"'), 'signature modal should include a View Terms action beside the agreement text');
assert(source.includes('id="signingTermsModal"'), 'signature flow should include a modal for reviewing the current quote terms');
assert(source.includes('function openSigningTermsModal'), 'quote viewer should centralize opening the signing terms modal');
assert(source.includes('function renderSigningTermsModal'), 'quote viewer should render current quote terms into the signing terms modal');
assert(/quoteData\.terms[\s\S]*signingTermsModalBody/.test(source), 'signing terms modal should use the current quote terms data');
assert(!source.includes("if (!document.getElementById('termsCheck').checked) { qdAlert('Please agree to the terms and conditions.'); return; }"), 'terms validation should not rely on a global modal hidden behind the signature overlay');
assert(source.includes("showSignatureApprovalMessage('Could not approve this quote: ' +"), 'approval save failures should show inside the signature modal');
assert(source.includes('approveBtn.disabled = true') && source.includes('approveBtn.disabled = false'), 'approval button should have a loading/restore state');

console.log('quote approval modal feedback static test passed');
