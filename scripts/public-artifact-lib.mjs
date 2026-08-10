import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function toPosix(value) {
  return value.split(path.sep).join('/');
}

export function resolveInside(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('Artifact paths must be non-empty strings.');
  }
  const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/'));
  if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) {
    throw new Error(`Artifact path escapes the repository: ${relativePath}`);
  }
  const resolved = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Artifact path escapes the repository: ${relativePath}`);
  }
  return resolved;
}

export async function listFiles(root) {
  const result = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result.push(toPosix(path.relative(root, absolute)));
      else throw new Error(`Artifact contains a non-regular file: ${toPosix(path.relative(root, absolute))}`);
    }
  }
  await visit(root);
  return result;
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function createArtifactManifest(outputDirectory, expectedFiles) {
  const entries = [];
  let totalBytes = 0;
  for (const file of [...expectedFiles].sort()) {
    const contents = await fs.readFile(resolveInside(outputDirectory, file));
    totalBytes += contents.length;
    entries.push({ path: file, bytes: contents.length, sha256: sha256(contents) });
  }
  const treeInput = entries.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}`).join('\n');
  return {
    schemaVersion: 1,
    outputDirectory: 'dist',
    fileCount: entries.length,
    totalBytes,
    treeSha256: sha256(Buffer.from(treeInput, 'utf8')),
    files: entries
  };
}

const textExtensions = new Set(['', '.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);

export async function scanArtifactForCredentials(outputDirectory, files) {
  const findings = [];
  const secretPatterns = [
    ['supabase-secret-key', /sb_secret_[A-Za-z0-9_-]+/g],
    ['service-role-assignment', /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']{12,}["']/gi],
    ['stripe-secret-key', /sk_(?:live|test)_[A-Za-z0-9]+/g],
    ['stripe-restricted-key', /rk_(?:live|test)_[A-Za-z0-9]+/g],
    ['openai-secret-key', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['github-token', /gh[pousr]_[A-Za-z0-9]+/g],
    ['google-oauth-client-secret', /GOCSPX-[A-Za-z0-9_-]+/g],
    ['aws-access-key', /AKIA[0-9A-Z]{16}/g],
    ['slack-token', /xox[baprs]-[A-Za-z0-9-]+/g],
    ['generic-secret-assignment', /\b(?:CLIENT_SECRET|PRIVATE_KEY|SECRET_KEY|API_SECRET|ACCESS_TOKEN)\b\s*[:=]\s*["'][^"']{12,}["']/gi]
  ];
  const publicPatterns = [
    ['supabase-publishable-key', /sb_publishable_[A-Za-z0-9_-]+/g],
    ['google-browser-api-key', /AIza[0-9A-Za-z_-]{30,}/g],
    ['stripe-publishable-key', /pk_(?:live|test)_[A-Za-z0-9]+/g],
    ['posthog-project-key', /phc_[A-Za-z0-9]+/g]
  ];
  const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

  for (const file of files) {
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    const text = await fs.readFile(resolveInside(outputDirectory, file), 'utf8');
    const lineAt = (offset) => text.slice(0, offset).split('\n').length;
    for (const [category, expression] of secretPatterns) {
      for (const match of text.matchAll(expression)) {
        findings.push({ file, line: lineAt(match.index), category, status: 'forbidden' });
      }
    }
    for (const [category, expression] of publicPatterns) {
      for (const match of text.matchAll(expression)) {
        findings.push({ file, line: lineAt(match.index), category, status: 'public-client' });
      }
    }
    for (const match of text.matchAll(jwtPattern)) {
      let role = 'unknown';
      try {
        const payload = match[0].split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
        const parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
        role = typeof parsed.role === 'string' ? parsed.role : 'unknown';
      } catch {
        role = 'unparseable';
      }
      findings.push({
        file,
        line: lineAt(match.index),
        category: role === 'anon' ? 'supabase-legacy-anon-key' : 'static-jwt',
        status: role === 'anon' ? 'public-client' : 'forbidden'
      });
    }
  }
  return findings;
}

function isExternalReference(reference) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\$\{|\{|about:)/i.test(reference);
}

function cleanReference(reference) {
  return reference.trim().replaceAll('&amp;', '&').split('#')[0].split('?')[0];
}

export function resolveArtifactReference(fromFile, rawReference) {
  const cleaned = cleanReference(rawReference);
  if (!cleaned || isExternalReference(cleaned) || cleaned.includes('${')) return null;
  const base = cleaned.startsWith('/') ? '' : path.posix.dirname(fromFile);
  const resolved = path.posix.normalize(path.posix.join(base, cleaned.replace(/^\//, '')));
  if (resolved.startsWith('../') || resolved === '..') return { raw: rawReference, resolved, invalid: true };
  return { raw: rawReference, resolved, invalid: false };
}

export async function collectInternalReferences(outputDirectory, files) {
  const references = [];
  const add = (from, raw, kind) => {
    const resolved = resolveArtifactReference(from, raw);
    if (resolved) references.push({ from, kind, ...resolved });
  };

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    const text = await fs.readFile(resolveInside(outputDirectory, file), 'utf8');

    if (extension === '.html') {
      for (const tag of text.matchAll(/<[a-z][^>]*>/gim)) {
        for (const match of tag[0].matchAll(/(?:^|\s)(?:src|href|action)\s*=\s*["']([^"']+)["']/gim)) add(file, match[1], 'html');
      }
    }
    if (extension === '.css') {
      for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gim)) add(file, match[1], 'css');
    }
    if (extension === '.html') {
      for (const styleBlock of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gim)) {
        for (const match of styleBlock[1].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gim)) add(file, match[1], 'css');
      }
      for (const styleAttribute of text.matchAll(/\bstyle\s*=\s*["']([^"']+)["']/gim)) {
        for (const match of styleAttribute[1].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gim)) add(file, match[1], 'css');
      }
    }
    if (extension === '.json') {
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      if (file === 'manifest.json' && parsed) {
        if (typeof parsed.start_url === 'string') add(file, parsed.start_url, 'manifest');
        for (const icon of [...(parsed.icons || []), ...(parsed.screenshots || [])]) {
          if (typeof icon.src === 'string') add(file, icon.src, 'manifest');
        }
      }
    }
    if (extension === '.js' || extension === '.html') {
      for (const match of text.matchAll(/(?:\bfetch|\bimport|serviceWorker\.register|\bnew\s+Worker)\s*\(\s*["']([^"']+)["']/gim)) add(file, match[1], 'script');
      for (const match of text.matchAll(/["']((?:\/)?(?:data|icons|videos)\/[A-Za-z0-9_./-]+\.(?:css|gif|jpe?g|js|json|mp4|png|svg|webm|woff2?))["']/gim)) add(file, match[1], 'asset-literal');
    }
  }
  return references;
}

export function referenceExists(reference, allowedFiles) {
  if (reference.invalid) return false;
  if (reference.resolved === '' || reference.resolved === '.') return allowedFiles.has('index.html');
  if (allowedFiles.has(reference.resolved)) return true;
  if (!path.posix.extname(reference.resolved) && allowedFiles.has(`${reference.resolved}.html`)) return true;
  if (reference.resolved.endsWith('/') && allowedFiles.has(`${reference.resolved}index.html`)) return true;
  return false;
}
