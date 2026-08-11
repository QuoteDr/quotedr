import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { publicArtifactConfig } from '../config/public-artifact.mjs';
import { buildPublicArtifact } from '../scripts/build-public-artifact.mjs';
import { resolveInside } from '../scripts/public-artifact-lib.mjs';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8']
]);

const { outputRoot } = await buildPublicArtifact();
const notFoundBody = await fs.readFile(resolveInside(outputRoot, '404.html'));
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/p/')) {
      response.writeHead(302, { Location: `/client-portal.html?p=${encodeURIComponent(url.pathname.slice(3))}` });
      response.end();
      return;
    }
    if (url.pathname.endsWith('.html')) {
      const htmlSource = resolveInside(outputRoot, decodeURIComponent(url.pathname).replace(/^\//, ''));
      try {
        const stat = await fs.stat(htmlSource);
        if (stat.isFile()) {
          const target = `${url.pathname.slice(0, -5) || '/'}${url.search}`;
          response.writeHead(308, { Location: target });
          response.end();
          return;
        }
      } catch {
        // Missing HTML files must reach the true-404 path below, without canonical fallback.
      }
    }

    let relative = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (!relative) relative = 'index.html';
    else if (relative.endsWith('/')) relative += 'index.html';
    else if (!path.posix.extname(relative)) relative += '.html';
    if (relative.includes('..')) throw new Error('Traversal rejected');

    const file = resolveInside(outputRoot, relative);
    const contents = await fs.readFile(file);
    response.writeHead(200, {
      'Content-Type': contentTypes.get(path.extname(relative).toLowerCase()) || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(contents);
  } catch {
    response.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(notFoundBody);
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  for (const route of publicArtifactConfig.requiredRoutes) {
    const response = await fetch(`${origin}${route}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `Required route failed local static smoke test: ${route}`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }

  for (const asset of ['/manifest.json', '/sw.js', '/icons/icon-192.png', '/data/whats-new.json', '/videos/tutorials/quote-builder-overview.mp4']) {
    const response = await fetch(`${origin}${asset}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `Required static asset failed local smoke test: ${asset}`);
  }

  const canonical = await fetch(`${origin}/invoice-viewer.html?ref=synthetic`, { redirect: 'manual' });
  assert.equal(canonical.status, 308);
  assert.equal(canonical.headers.get('location'), '/invoice-viewer?ref=synthetic');

  const callback = await fetch(`${origin}/qb-callback.html?code=synthetic&state=synthetic`, { redirect: 'manual' });
  assert.equal(callback.status, 308);
  assert.equal(callback.headers.get('location'), '/qb-callback?code=synthetic&state=synthetic');

  const portal = await fetch(`${origin}/p/synthetic`, { redirect: 'manual' });
  assert.equal(portal.status, 302);
  assert.equal(portal.headers.get('location'), '/client-portal.html?p=synthetic');

  for (const forbiddenPath of publicArtifactConfig.knownForbiddenPaths) {
    const response = await fetch(`${origin}${forbiddenPath}`, { redirect: 'manual' });
    assert.equal(response.status, 404, `Forbidden repository path did not return a true 404: ${forbiddenPath}`);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-cache, no-store, must-revalidate');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), notFoundBody, `Forbidden path did not receive the exact allowlisted 404 document: ${forbiddenPath}`);
  }

  for (const absentPath of ['/not-a-real-quotedr-route', '/nested/not-a-real-quotedr-route.json']) {
    const response = await fetch(`${origin}${absentPath}`, { redirect: 'manual' });
    assert.equal(response.status, 404, `Absent origin path did not return a genuine 404: ${absentPath}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), notFoundBody, `Absent origin path received an application fallback body: ${absentPath}`);
  }

  console.log(`Local static-server smoke checks passed on desktop-independent HTTP routes (${publicArtifactConfig.requiredRoutes.length} routes, ${publicArtifactConfig.knownForbiddenPaths.length} forbidden probes).`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
