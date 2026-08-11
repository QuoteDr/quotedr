import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { publicArtifactConfig } from '../config/public-artifact.mjs';
import { buildPublicArtifact } from '../scripts/build-public-artifact.mjs';
import {
  collectInternalReferences,
  createArtifactManifest,
  listFiles,
  referenceExists,
  resolveInside,
  scanArtifactForCredentials
} from '../scripts/public-artifact-lib.mjs';

const { manifest, outputRoot } = await buildPublicArtifact();
const expected = [...publicArtifactConfig.files].sort((a, b) => a.localeCompare(b));
const actual = await listFiles(outputRoot);
assert.deepEqual(actual, expected, 'dist/ must contain exactly the file-exact production allowlist');
assert(actual.includes('404.html'), 'The allowlisted top-level Pages 404 document must be present');

const forbiddenPathPatterns = [
  /(^|\/)(?:\.git|android-app|backups|docs|mobile-companion|node_modules|scripts|supabase|templates|tests|TODO|tutorial-videos)(\/|$)/i,
  /(^|\/)\.(?:env|npmrc)(?:\.|$)/i,
  /(?:^|[._-])(?:backup|old|temp|tmp)(?:[._-]|$)/i,
  /(?:\.bak|\.map|\.md|\.sql|~)$/i
];
for (const file of actual) {
  for (const pattern of forbiddenPathPatterns) {
    assert(!pattern.test(file), `Forbidden artifact path category present: ${file}`);
  }
}
for (const forbiddenPath of publicArtifactConfig.knownForbiddenPaths) {
  const relative = forbiddenPath.replace(/^\//, '');
  assert(!actual.includes(relative), `Known exposed repository path is still in the artifact: ${forbiddenPath}`);
}

for (const route of publicArtifactConfig.requiredRoutes) {
  const relative = route === '/' ? 'index.html' : route.endsWith('/') ? `${route.slice(1)}index.html` : `${route.slice(1)}.html`;
  assert(actual.includes(relative), `Required route source is missing: ${route}`);
}

const credentialFindings = await scanArtifactForCredentials(outputRoot, actual);
const forbiddenCredentials = credentialFindings.filter((finding) => finding.status === 'forbidden');
assert.deepEqual(
  forbiddenCredentials,
  [],
  `Potential non-public credential patterns detected at ${forbiddenCredentials.map((item) => `${item.file}:${item.line} (${item.category})`).join(', ')}`
);
const publicCredentialCategories = new Set(credentialFindings.map((finding) => finding.category));
assert(publicCredentialCategories.has('supabase-legacy-anon-key'), 'Expected legacy Supabase anon client configuration was not classified');
assert(publicCredentialCategories.has('google-browser-api-key'), 'Expected Google browser client configuration was not classified');
const publicCredentialLocations = credentialFindings
  .filter((finding) => finding.status === 'public-client')
  .map((finding) => `${finding.category}|${finding.file}`)
  .sort();
assert.deepEqual(
  publicCredentialLocations,
  [...publicArtifactConfig.expectedPublicClientKeyOccurrences].sort(),
  'Every client-visible key occurrence must be explicitly reviewed by category and file'
);

const allowedFiles = new Set(actual);
const references = await collectInternalReferences(outputRoot, actual);
const brokenReferences = references.filter((reference) => !referenceExists(reference, allowedFiles));
assert.deepEqual(
  brokenReferences,
  [],
  `Broken internal artifact references: ${brokenReferences.map((item) => `${item.from} -> ${item.raw}`).join(', ')}`
);

const rebuiltManifest = await createArtifactManifest(outputRoot, expected);
assert.deepEqual(rebuiltManifest, manifest, 'Candidate manifest must exactly describe the built output');
const committedManifest = JSON.parse(await fs.readFile(resolveInside(path.dirname(outputRoot), publicArtifactConfig.manifestPath), 'utf8'));
assert.deepEqual(committedManifest, manifest, 'Tracked candidate manifest must be current');

const headers = await fs.readFile(resolveInside(outputRoot, '_headers'), 'utf8');
assert(headers.includes('Content-Security-Policy:'), 'Cloudflare CSP must remain in the artifact');
assert(headers.includes('/sw.js') && headers.includes('Service-Worker-Allowed: /'), 'Service-worker headers must remain in the artifact');
const redirects = await fs.readFile(resolveInside(outputRoot, '_redirects'), 'utf8');
assert(redirects.includes('/p/* /client-portal.html?p=:splat 302'), 'Clean client portal redirect must remain in the artifact');
const notFoundDocument = await fs.readFile(resolveInside(outputRoot, '404.html'), 'utf8');
assert(notFoundDocument.includes('<meta name="robots" content="noindex">'), 'The public 404 document must remain excluded from indexing');
assert(!notFoundDocument.includes('window.location') && !notFoundDocument.includes('http-equiv="refresh"'), 'The public 404 document must not redirect into the application');

console.log(`Public artifact checks passed: ${manifest.fileCount} files, ${references.length} internal references, ${credentialFindings.length} public-client key occurrences classified without printing values.`);
