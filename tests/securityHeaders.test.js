// tests/securityHeaders.test.js — Wave 2: security headers (helmet) + trust proxy
//
// This process runs in production mode (NODE_ENV=production) so that:
//   * trust proxy is enabled -> req.ip follows X-Forwarded-For
//   * HSTS is emitted for requests arriving over forwarded HTTPS
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('node:events');

process.env.NODE_ENV = 'production';
process.env.RATE_LIMIT_MAX = '10';
process.env.RATE_LIMIT_MAX_HEAVY = '10';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aralink-hdr-'));
process.env.ENV_FILE = path.join(tmpDir, '.env');
fs.writeFileSync(process.env.ENV_FILE, 'GEMINI_API_KEY=abcdef1234567890\n');

const app = require('../server/server');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup only
  }
});

test('standard security headers present on API responses', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.ok(res.headers.get('referrer-policy'), 'Referrer-Policy missing');
});

test('Content-Security-Policy is enabled with correct directives', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'CSP header missing');
  assert.match(csp, /default-src 'self'/, 'default-src missing');
  assert.match(csp, /script-src/, 'script-src missing');
  assert.match(csp, /style-src/, 'style-src missing');
});

test('HSTS set on every response (helmet 8; browsers honor it only over HTTPS)', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const hsts = res.headers.get('strict-transport-security') || '';
  assert.match(hsts, /^max-age=\d+/, 'HSTS missing');
});

test('security headers also present on static pages', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('trust proxy: rate limiter buckets per forwarded client IP', async () => {
  const ipA = '203.0.113.10';
  const ipB = '203.0.113.11';
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${baseUrl}/api/health`, { headers: { 'X-Forwarded-For': ipA } });
    assert.equal(res.status, 200, `request ${i + 1} from ${ipA} should pass`);
  }
  const blocked = await fetch(`${baseUrl}/api/health`, { headers: { 'X-Forwarded-For': ipA } });
  assert.equal(blocked.status, 429, `${ipA} should be rate-limited now`);
  const fresh = await fetch(`${baseUrl}/api/health`, { headers: { 'X-Forwarded-For': ipB } });
  assert.equal(fresh.status, 200, `${ipB} must have its own bucket`);
});