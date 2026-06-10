const fs = require('fs');
const assert = require('assert');

const portal = fs.readFileSync('client-portal.html', 'utf8');

assert(
  /function enhancePortalOpenCard\(card,\s*href,\s*label\)/.test(portal) &&
  /card\.setAttribute\('data-open-href',\s*href\)/.test(portal) &&
  /card\.addEventListener\('click',\s*handlePortalCardOpen\)/.test(portal) &&
  /card\.addEventListener\('keydown',\s*handlePortalCardKeyOpen\)/.test(portal),
  'Portal quote and invoice cards should be enhanced as clickable cards'
);

assert(
  /portalCardInteractiveClick\(event\)[\s\S]*closest\('a, button, input, select, textarea, label, \[role="button"\], \.client-signature-preview'\)/.test(portal),
  'Clickable cards should ignore clicks on buttons, links, fields, and signature controls'
);

assert(
  /if \(event\.key !== 'Enter' && event\.key !== ' '\) return;/.test(portal) &&
  /event\.preventDefault\(\);[\s\S]*openPortalDocumentHref/.test(portal),
  'Clickable cards should be keyboard accessible with Enter and Space'
);

assert(
  /enhancePortalOpenCard\(card,\s*primaryHref,\s*docType\.actionLabel \+ ': ' \+ portalDocumentTitle\(quote\)\)/.test(portal),
  'Main portal document cards should open the same target as their primary action button'
);

assert(
  /data-open-href/.test(portal) &&
  /handlePortalCardOpen\(event\)/.test(portal) &&
  /Review Change Order/.test(portal),
  'Change order cards should also support click-anywhere opening'
);
