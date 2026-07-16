const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'tests', 'mobile-companion', 'supabase']);
const ignoredFiles = new Set(['supabase.js']); // Retired compatibility file; no page loads it.

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(path.join(directory, entry.name), output);
    } else if (/\.(?:js|html)$/.test(entry.name) && !ignoredFiles.has(entry.name)) {
      output.push(path.join(directory, entry.name));
    }
  }
  return output;
}

function approvedAdapterRegion(relative, source, index) {
  if (relative === 'supabase-v2.js') {
    const start = source.indexOf('async function qdExecuteFreshQuoteUpdate');
    const end = source.indexOf('async function qdReadDurableSupabaseVersion');
    if (index >= start && index < end) return true;
  }
  if (relative === 'client-portal.html') {
    const start = source.indexOf('async function writePortalJobAssetBundle');
    const end = source.indexOf('function registerPortalJobAssetBundleAdapter');
    if (index >= start && index < end) return true;
  }
  return false;
}

const violations = [];
for (const file of walk(root)) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  const writePattern = /\.from\((['"])[a-z0-9_]+\1\)[\s\S]{0,500}?\.(insert|upsert|update|delete)\(/gi;
  for (const match of source.matchAll(writePattern)) {
    const index = match.index || 0;
    if (approvedAdapterRegion(relative, source, index)) continue;
    const nearby = source.slice(Math.max(0, index - 260), Math.min(source.length, index + match[0].length + 80));
    if (nearby.includes('qd-save-audit:')) continue;
    const line = source.slice(0, index).split(/\r?\n/).length;
    violations.push(`${relative}:${line} direct ${match[2]} write`);
  }
}

assert.deepStrictEqual(
  violations,
  [],
  `Durable business writes must use QuoteDrSave adapters. Explicitly noncritical telemetry needs a qd-save-audit comment.\n${violations.join('\n')}`
);

console.log('durable save direct-write audit passed');
