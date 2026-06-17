const fs = require('fs');
const assert = require('assert');

const headers = fs.readFileSync('_headers', 'utf8');

assert(
  headers.includes("frame-src 'self' https://js.stripe.com"),
  'CSP frame-src must allow same-origin portal preview iframes plus Stripe'
);

