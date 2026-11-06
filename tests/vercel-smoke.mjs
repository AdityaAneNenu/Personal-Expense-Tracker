import assert from 'node:assert/strict';

// Run against an existing `vercel dev` server or a deployment URL. No sign-in or
// data writes: /api/health only checks Firebase connectivity.
const base = new URL(process.argv[2] || 'http://localhost:3000');
async function get(path) {
  return fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
}

const scripts = new Set(['/theme.js']);
for (const path of ['/login', '/transactions/example']) {
  const response = await get(path);
  assert.equal(response.status, 200, `${path} loads the SPA`);
  assert.match(response.headers.get('content-type'), /text\/html/);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) {
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
    assert.ok(response.headers.get('content-security-policy')?.includes("script-src 'self' https://apis.google.com"));
  }
  const html = await response.text();
  assert.ok(html.includes('<div id="root"></div>'), `${path} contains the React root`);
  for (const match of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) scripts.add(match[1]);
}

for (const path of scripts) {
  const response = await get(path);
  assert.equal(response.status, 200, `${path} loads`);
  assert.match(response.headers.get('content-type'), /javascript/, `${path} must not be rewritten to HTML`);
}
const icon = await get('/favicon.svg');
assert.equal(icon.status, 200);
assert.match(icon.headers.get('content-type'), /image\/svg\+xml/);

for (const [path, status] of [['/api', 404], ['/api/not-a-route', 404], ['/api/transactions', 401], ['/api/health', 200]]) {
  const response = await get(path);
  assert.equal(response.status, status, `${path} is handled by Express`);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = await response.json();
  assert.ok(status === 200 ? payload.data?.status === 'ok' : payload.error, `${path} returns the API envelope`);
}

const preflight = await fetch(new URL('/api/transactions', base), {
  method: 'OPTIONS',
  headers: { Origin: base.origin, 'Access-Control-Request-Method': 'POST' },
  signal: AbortSignal.timeout(20000),
});
assert.equal(preflight.status, 204, 'The public site origin can call the API');
assert.equal(preflight.headers.get('access-control-allow-origin'), base.origin);
console.log('PASS Vercel SPA deep links, JavaScript/assets, API routing, authentication boundary, Firebase health, and origin checks');
