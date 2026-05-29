const fs = require('fs');
const assert = require('assert');

const portal = fs.readFileSync('client-portal.html', 'utf8');

assert(
  portal.includes('function quoteSignatureSrc(quote)'),
  'Client portal should centralize signature image lookup for quote cards'
);

assert(
  /quote\.data\?\.signature_url\s*\|\|\s*quote\.signature_url\s*\|\|\s*quote\.data\?\.signature_data_url\s*\|\|\s*quote\.signature_data_url/.test(portal),
  'Signature preview should support stored signature URLs and base64 fallback data'
);

assert(
  portal.includes('signed-signature-preview') &&
  portal.includes('client-signature-preview') &&
  portal.includes('Signed by client'),
  'Signed quotes should show a signature image preview in the card action area'
);

assert(
  portal.includes('function quoteSignatureTimestamp(quote)') &&
  /quote\.data\?\.signed_at\s*\|\|\s*quote\.signed_at\s*\|\|\s*quote\.data\?\.accepted_at\s*\|\|\s*quote\.accepted_at\s*\|\|\s*quote\.data\?\.approved_at\s*\|\|\s*quote\.approved_at/.test(portal),
  'Signature preview should use signed_at first and fall back to accepted/approved timestamps'
);

assert(
  portal.includes('client-signature-timestamp') &&
  portal.includes('Signed ${signatureTimestamp}'),
  'Signed quote signature preview should display a formatted signature timestamp when available'
);

assert(
  /querySelectorAll\('\.signature-btn, \.client-signature-preview'\)/.test(portal),
  'Signature button and card preview should both open the signature lightbox'
);
