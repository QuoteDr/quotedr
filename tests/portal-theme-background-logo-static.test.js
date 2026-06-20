const fs = require('fs');
const assert = require('assert');

const settings = fs.readFileSync('settings.html', 'utf8');
const studio = fs.readFileSync('portal-theme-studio.html', 'utf8');
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
assert(settings.includes("layoutStyle: 'premium-hub', headerColor: '#b9d0f3', bgColor: '#ffffff', bgColor2: '#ffffff'"), 'Settings Premium built-in theme should default to the approved soft blue header and white backgrounds');
assert(studio.includes("layoutStyle: 'premium-hub', headerColor: '#b9d0f3', bgColor: '#ffffff', bgColor2: '#ffffff'"), 'Theme Studio Premium built-in theme should default to the approved soft blue header and white backgrounds');
assert(studio.includes('id="portalThemeApplyStarterBtn"'), 'Theme Studio should provide an explicit button to reapply built-in defaults');
assert(studio.includes("headerDetailColor: '#26364d'"), 'Theme Studio should default header detail text to a readable dark muted color');
assert(studio.includes("mutedTextColor: '#26364d'"), 'Theme Studio should default muted text to a readable dark muted color');

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
assert(portal.includes("const headerTextColor = t.headerTextColor || '#10233d';"), 'Client portal header text should not fall back to accent color when a saved theme lacks headerTextColor');
assert(portal.includes("const cardTextColor = t.cardTextColor || '#10233d';"), 'Client portal card text should not fall back to accent color when a saved theme lacks cardTextColor');
assert(portal.includes("--portal-muted-text: #26364d;"), 'Client portal muted text fallback should be readable');
assert(portal.includes("const mutedTextColor = t.mutedTextColor || '#26364d';"), 'Client portal should use readable muted text when a saved theme lacks mutedTextColor');
assert(portal.includes('background: var(--portal-page-background, #ffffff) !important;'), 'Premium portal layout should fall back to a white page background, not the old green fade');
assert(portal.includes("if (bgColor.toLowerCase() === '#ffffff') return '#ffffff';"), 'Paper background style should remain pure white when Background 2 is white');
assert(portal.includes('linear-gradient') && portal.includes('radial-gradient'), 'Client portal should support faded/gradient background styles');
