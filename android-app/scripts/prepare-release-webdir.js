const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(appRoot, '..');
const webDir = path.join(appRoot, 'www');

const copyFileExtensions = new Set([
  '.css',
  '.html',
  '.ico',
  '.jpg',
  '.jpeg',
  '.js',
  '.json',
  '.mp4',
  '.webm',
  '.vtt',
  '.png',
  '.svg',
  '.txt',
  '.webmanifest',
  '.webp',
]);

const copyDirectories = new Set([
  'blog',
  'icons',
  'templates',
  'tutorial-videos',
  'videos',
]);

const skipTopLevelFiles = new Set([
  '.env.local',
  '.git',
  '.gitignore',
  'app.py',
  'fix_navbar.sh',
  'requirements.txt',
]);

function copyRecursive(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  if (!copyFileExtensions.has(path.extname(source).toLowerCase())) return;

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function writeAppEntryFiles() {
  fs.writeFileSync(path.join(webDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>QuoteDr</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="shell">
    <img src="icon-192.png" alt="" class="logo">
    <h1>QuoteDr is opening</h1>
    <p>Loading your quoting workspace...</p>
    <a href="dashboard.html" id="fallbackLink">Open QuoteDr</a>
  </main>
  <script type="module" src="app.js"></script>
</body>
</html>
`);

  fs.writeFileSync(path.join(webDir, 'app.js'), `import { App } from '@capacitor/app';

App.addListener('appUrlOpen', () => {});
App.addListener('backButton', ({ canGoBack }) => {
  if (!canGoBack) App.minimizeApp();
});

window.addEventListener('DOMContentLoaded', () => {
  window.setTimeout(() => {
    window.location.replace('dashboard.html');
  }, 250);
});
`);
}

fs.rmSync(webDir, { recursive: true, force: true });
fs.mkdirSync(webDir, { recursive: true });

for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
  if (entry.name.startsWith('.') || skipTopLevelFiles.has(entry.name)) continue;

  const source = path.join(projectRoot, entry.name);
  const destination = path.join(webDir, entry.name);

  if (entry.isDirectory()) {
    if (copyDirectories.has(entry.name)) copyRecursive(source, destination);
    continue;
  }

  if (copyFileExtensions.has(path.extname(entry.name).toLowerCase())) {
    copyRecursive(source, destination);
  }
}

writeAppEntryFiles();

console.log(`Prepared QuoteDr release web assets in ${webDir}`);
