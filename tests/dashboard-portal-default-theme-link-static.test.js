const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  dashboard.includes('Edit Default Theme'),
  'Portal theme editor should include an Edit Default Theme shortcut'
);

assert(
  dashboard.includes('href="settings.html#portal-theme"'),
  'Edit Default Theme shortcut should link to the settings portal theme anchor'
);

assert(
  dashboard.includes('function openPortalDefaultThemeSettings()') &&
  dashboard.includes("localStorage.setItem('ald_settings_tab', 'portal')") &&
  dashboard.includes("window.location.href = 'settings.html#portal-theme'"),
  'Edit Default Theme shortcut should select the Portal Theme settings tab before navigating'
);
