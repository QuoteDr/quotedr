const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const safePath = pathname === '/' ? '/index.html' : pathname;
  serveFile(path.join(root, safePath.replace(/^\/+/, '')), res);
});

function request(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

server.listen(0, '127.0.0.1', async () => {
  try {
    const { port } = server.address();
    const helperStatus = await request(`http://127.0.0.1:${port}/quote-discounts.js`);
    const builderStatus = await request(`http://127.0.0.1:${port}/quote-builder.html`);
    if (helperStatus !== 200) throw new Error('quote-discounts.js should be served with HTTP 200');
    if (builderStatus !== 200) throw new Error('quote-builder.html should be served with HTTP 200');
    console.log('static server smoke test passed');
  } finally {
    server.close();
  }
});
