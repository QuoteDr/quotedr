const fs = require('fs');
const assert = require('assert');

const settings = fs.readFileSync('settings.html', 'utf8');
const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const portal = fs.readFileSync('client-portal.html', 'utf8');

assert(settings.includes('id="portalBgStyle"'), 'Settings portal theme should include a background style selector');
assert(settings.includes('id="portalBgStrength"'), 'Settings portal theme should include a fade strength slider');
assert(settings.includes('id="portalLogoInput"'), 'Settings portal theme should include a portal-only logo upload control');
assert(settings.includes('This will only change the portal logo'), 'Settings should explain portal logo changes are portal-only');
assert(settings.includes('handlePortalLogoUpload'), 'Settings should handle portal-only logo uploads');
assert(settings.includes('portalPreviewFrame'), 'Settings live preview should render a mini portal frame');
assert(settings.includes('portalPreviewStats'), 'Settings live preview should include portal summary stat cards');
assert(settings.includes('portalPreviewQuoteCard'), 'Settings live preview should include a realistic quote card');
assert(settings.includes('portalPreviewFilterBar'), 'Settings live preview should show the portal filter controls');
assert(settings.includes('portalPreviewClientName'), 'Settings live preview should show the client identity area');
assert(!settings.includes('id="portalPreviewHeader"'), 'Settings live preview should not include a fake portal header strip');

assert(dashboard.includes('portal-theme-bg-style-'), 'Manage Portals theme editor should expose background style overrides');
assert(dashboard.includes('portal-theme-bg-strength-'), 'Manage Portals theme editor should expose background fade strength overrides');
assert(dashboard.includes('portal-theme-logo-input-'), 'Manage Portals theme editor should expose portal-only logo upload overrides');
assert(dashboard.includes('This will only change the portal logo'), 'Manage Portals should explain portal logo changes are portal-only');
assert(dashboard.includes('handlePortalThemeLogoUpload'), 'Manage Portals should handle portal-only logo uploads');

assert(portal.includes('function portalBodyBackground(theme)'), 'Client portal should centralize themed background rendering');
assert(portal.includes('bgStyle') && portal.includes('bgStrength'), 'Client portal should read background style and strength from portal theme');
assert(portal.includes('portalLogo') && portal.includes('renderPortalLogo'), 'Client portal should support a portal-specific logo override');
assert(portal.includes('portal-logo-custom'), 'Client portal should mark custom portal logos so they render without the business-logo card treatment');
assert(portal.includes("classList.toggle('portal-logo-custom', !!t.portalLogo)"), 'Client portal should toggle the custom-logo state when the theme draft changes');
assert(portal.includes('linear-gradient') && portal.includes('radial-gradient'), 'Client portal should support faded/gradient background styles');
